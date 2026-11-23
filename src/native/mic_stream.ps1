$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDevice {
    int Activate(ref Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}

[Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioMeterInformation {
    int GetPeakValue(out float pfPeak);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
internal class MMDeviceEnumeratorComObject { }

public static class MediaPlaybackDetector {
    private static IMMDeviceEnumerator _enumerator = null;
    private static IAudioMeterInformation _meter = null;
    private static DateTime _lastInit = DateTime.MinValue;

    private static void EnsureInit() {
        if (_meter != null && (DateTime.UtcNow - _lastInit).TotalSeconds < 30) return;
        try {
            _enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
            IMMDevice dev;
            if (_enumerator.GetDefaultAudioEndpoint(0, 1, out dev) == 0 && dev != null) {
                Guid iid = typeof(IAudioMeterInformation).GUID;
                object meterObj;
                if (dev.Activate(ref iid, 1, IntPtr.Zero, out meterObj) == 0 && meterObj != null) {
                    _meter = (IAudioMeterInformation)meterObj;
                    _lastInit = DateTime.UtcNow;
                }
            }
        } catch {
            _meter = null;
        }
    }

    public static float GetMasterPeak() {
        try {
            EnsureInit();
            if (_meter != null) {
                float peak = 0f;
                if (_meter.GetPeakValue(out peak) == 0) return peak;
            }
        } catch {
            _meter = null;
        }
        return 0f;
    }
}

public class WinMmPcmStreamer {
    private const int CALLBACK_FUNCTION = 0x30000;
    private const int WIM_DATA = 0x3C0;
    private const int WAVE_FORMAT_PCM = 1;

    [StructLayout(LayoutKind.Sequential)]
    private struct WAVEFORMATEX {
        public ushort wFormatTag;
        public ushort nChannels;
        public uint nSamplesPerSec;
        public uint nAvgBytesPerSec;
        public ushort nBlockAlign;
        public ushort wBitsPerSample;
        public ushort cbSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WAVEHDR {
        public IntPtr lpData;
        public uint dwBufferLength;
        public uint dwBytesRecorded;
        public IntPtr dwUser;
        public uint dwFlags;
        public uint dwLoops;
        public IntPtr lpNext;
        public IntPtr reserved;
    }

    private delegate void WaveInProc(IntPtr hwi, uint uMsg, IntPtr dwInstance, IntPtr dwParam1, IntPtr dwParam2);

    [DllImport("winmm.dll")]
    private static extern uint waveInGetNumDevs();

    [DllImport("winmm.dll")]
    private static extern int waveInOpen(out IntPtr phwi, uint uDeviceID, ref WAVEFORMATEX pwfx, WaveInProc dwCallback, IntPtr dwInstance, uint fdwOpen);

    [DllImport("winmm.dll")]
    private static extern int waveInPrepareHeader(IntPtr hwi, IntPtr pwh, uint cbwh);

    [DllImport("winmm.dll")]
    private static extern int waveInUnprepareHeader(IntPtr hwi, IntPtr pwh, uint cbwh);

    [DllImport("winmm.dll")]
    private static extern int waveInAddBuffer(IntPtr hwi, IntPtr pwh, uint cbwh);

    [DllImport("winmm.dll")]
    private static extern int waveInStart(IntPtr hwi);

    [DllImport("winmm.dll")]
    private static extern int waveInStop(IntPtr hwi);

    [DllImport("winmm.dll")]
    private static extern int waveInReset(IntPtr hwi);

    [DllImport("winmm.dll")]
    private static extern int waveInClose(IntPtr hwi);

    public static int Run() {
        if (waveInGetNumDevs() == 0) {
            Console.Error.WriteLine("NO_MIC_DETECTED");
            return 2;
        }

        const int sampleRate = 16000;
        const int channels = 1;
        const int bitsPerSample = 16;
        const int chunkMs = 80;
        const int bufferBytes = (sampleRate * (bitsPerSample / 8) * channels * chunkMs) / 1000; // 2560 bytes
        const int numBuffers = 6;

        var format = new WAVEFORMATEX {
            wFormatTag = WAVE_FORMAT_PCM,
            nChannels = channels,
            nSamplesPerSec = sampleRate,
            wBitsPerSample = bitsPerSample,
            nBlockAlign = (ushort)(channels * (bitsPerSample / 8)),
            nAvgBytesPerSec = sampleRate * channels * (bitsPerSample / 8),
            cbSize = 0
        };

        Stream stdout = Console.OpenStandardOutput();
        object writeLock = new object();
        var stopEvent = new ManualResetEventSlim(false);
        bool stopping = false;

        // Monitor stdin EOF so streamer exits immediately when parent Node process closes
        var stdinWatcher = new Thread(() => {
            try {
                while (Console.In.ReadLine() != null) {}
            } catch {
            } finally {
                stopping = true;
                stopEvent.Set();
            }
        });
        stdinWatcher.IsBackground = true;
        stdinWatcher.Start();

        IntPtr hWaveIn = IntPtr.Zero;
        IntPtr[] hdrPtrs = new IntPtr[numBuffers];
        IntPtr[] dataPtrs = new IntPtr[numBuffers];

        int meterCounter = 0;
        bool lastSpeakerActive = false;
        DateTime lastActiveSpeakerTime = DateTime.MinValue;

        WaveInProc callback = (IntPtr hwi, uint uMsg, IntPtr dwInstance, IntPtr dwParam1, IntPtr dwParam2) => {
            if (uMsg != WIM_DATA || stopping) return;
            try {
                WAVEHDR hdr = (WAVEHDR)Marshal.PtrToStructure(dwParam1, typeof(WAVEHDR));
                int bytes = (int)hdr.dwBytesRecorded;
                if (bytes > 0) {
                    byte[] chunk = new byte[bytes];
                    Marshal.Copy(hdr.lpData, chunk, 0, bytes);
                    lock (writeLock) {
                        if (!stopping) {
                            stdout.Write(chunk, 0, bytes);
                            stdout.Flush();
                        }
                    }
                }

                // Check Windows master audio meter (speaker playback detector) every ~320ms
                meterCounter++;
                if (meterCounter % 4 == 0) {
                    float peak = MediaPlaybackDetector.GetMasterPeak();
                    bool isActive = peak > 0.015f;
                    if (isActive) {
                        lastActiveSpeakerTime = DateTime.UtcNow;
                        if (!lastSpeakerActive) {
                            lastSpeakerActive = true;
                            Console.Error.WriteLine("SPEAKER_PLAYING:1");
                        }
                    } else if (lastSpeakerActive && (DateTime.UtcNow - lastActiveSpeakerTime).TotalMilliseconds > 1500) {
                        lastSpeakerActive = false;
                        Console.Error.WriteLine("SPEAKER_PLAYING:0");
                    }
                }

                if (!stopping) {
                    waveInAddBuffer(hwi, dwParam1, (uint)Marshal.SizeOf(typeof(WAVEHDR)));
                }
            } catch {
                stopping = true;
                stopEvent.Set();
            }
        };

        GCHandle cbHandle = GCHandle.Alloc(callback);
        try {
            int openRes = waveInOpen(out hWaveIn, 0xFFFFFFFF, ref format, callback, IntPtr.Zero, CALLBACK_FUNCTION);
            if (openRes != 0) {
                Console.Error.WriteLine("WAVEIN_OPEN_FAILED:" + openRes);
                return 3;
            }

            uint hdrSize = (uint)Marshal.SizeOf(typeof(WAVEHDR));
            for (int i = 0; i < numBuffers; i++) {
                dataPtrs[i] = Marshal.AllocHGlobal(bufferBytes);
                hdrPtrs[i] = Marshal.AllocHGlobal((int)hdrSize);
                var hdr = new WAVEHDR {
                    lpData = dataPtrs[i],
                    dwBufferLength = bufferBytes,
                    dwFlags = 0
                };
                Marshal.StructureToPtr(hdr, hdrPtrs[i], false);
                waveInPrepareHeader(hWaveIn, hdrPtrs[i], hdrSize);
                waveInAddBuffer(hWaveIn, hdrPtrs[i], hdrSize);
            }

            int startRes = waveInStart(hWaveIn);
            if (startRes != 0) {
                Console.Error.WriteLine("WAVEIN_START_FAILED:" + startRes);
                return 4;
            }

            Console.Error.WriteLine("STREAM_READY");
            stopEvent.Wait();

            stopping = true;
            waveInStop(hWaveIn);
            waveInReset(hWaveIn);
            for (int i = 0; i < numBuffers; i++) {
                if (hdrPtrs[i] != IntPtr.Zero) waveInUnprepareHeader(hWaveIn, hdrPtrs[i], hdrSize);
            }
            return 0;
        } finally {
            if (hWaveIn != IntPtr.Zero) waveInClose(hWaveIn);
            for (int i = 0; i < numBuffers; i++) {
                if (hdrPtrs[i] != IntPtr.Zero) Marshal.FreeHGlobal(hdrPtrs[i]);
                if (dataPtrs[i] != IntPtr.Zero) Marshal.FreeHGlobal(dataPtrs[i]);
            }
            if (cbHandle.IsAllocated) cbHandle.Free();
            stopEvent.Dispose();
        }
    }
}
"@

exit ([WinMmPcmStreamer]::Run())
