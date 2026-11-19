$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

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
