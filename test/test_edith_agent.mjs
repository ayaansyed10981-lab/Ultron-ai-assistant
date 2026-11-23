import assert from 'node:assert/strict';
import { ULTRON_TEAM, getSpokenTeamIntro, getEdithIntro } from '../src/agents/team_registry.js';
import { TeamOrchestrator } from '../src/agents/orchestrator.js';
import { tryFastPath } from '../src/fastpath.js';
import { normalizeSpokenTranscript } from '../src/audio.js';
import { ComputerController } from '../src/tools.js';

console.log('[TEST] Starting Edith Agent Verification...');

// 1. Team Registry Verification
assert.ok(ULTRON_TEAM.specialists.edith, 'Edith must be registered in ULTRON_TEAM.specialists');
assert.equal(ULTRON_TEAM.specialists.edith.name, 'Edith');
assert.equal(ULTRON_TEAM.specialists.edith.title, 'Chief Media & Content Editor');
console.log('✔ Edith registered in team specialists:', ULTRON_TEAM.specialists.edith.title);

const teamIntro = getSpokenTeamIntro();
assert.ok(teamIntro.includes('Edith'), 'Spoken team intro must include Edith');
console.log('✔ Spoken team intro includes Edith');

const edithIntro = getEdithIntro();
assert.ok(edithIntro.includes('Edith') && edithIntro.includes('Editor'), 'Edith intro must be accurate');
console.log('✔ Edith intro verified:', edithIntro);

// 2. Phonetic Speech Normalizer Verification
assert.equal(normalizeSpokenTranscript('hey ee dith'), 'hey edith');
assert.equal(normalizeSpokenTranscript('hey edit h'), 'hey edith');
assert.equal(normalizeSpokenTranscript('talk to edath'), 'talk to edith');
console.log('✔ Phonetic speech normalizer maps Edith mishearings accurately');

// 3. Fastpath Agent Switching & Specialist Inquiries
const mockController = {
  async executeTool() { return { ok: true, text: '{"ok":true}' }; },
  getActiveTasksSummary: (agent) => (agent === 'edith' ? 'Edith is on standby, sir.' : 'Team standby'),
};

const switchRes = await tryFastPath('switch to edith', mockController, 'ultron');
assert.ok(switchRes && switchRes.switchAgent === 'edith', 'Switching to edith must work');
console.log('✔ Fastpath agent switch handled:', switchRes.text);

const switchRes2 = await tryFastPath('talk to edith', mockController, 'ultron');
assert.ok(switchRes2 && switchRes2.switchAgent === 'edith');

const wakeRes = await tryFastPath('', mockController, 'edith');
assert.ok(wakeRes && wakeRes.includes('Edith here'));
console.log('✔ Direct wake greeting for Edith verified:', wakeRes);

const directSwitch = await tryFastPath('edith', mockController, 'ultron');
assert.ok(directSwitch && directSwitch.switchAgent === 'edith');

const specialistRes = await tryFastPath('who is the editing agent', mockController, 'ultron');
assert.ok(specialistRes && specialistRes.includes('Edith is our Chief Media & Content Editor'));
console.log('✔ Specialist inquiry ("who is the editing agent") answered correctly');

const specialistRes2 = await tryFastPath('who edits videos', mockController, 'ultron');
assert.ok(specialistRes2 && specialistRes2.includes('Edith is our Chief Media & Content Editor'));
console.log('✔ Specialist inquiry ("who edits videos") answered correctly');

const introRes = await tryFastPath('who are you', mockController, 'edith');
assert.ok(introRes && introRes.includes('I am Edith'));
console.log('✔ Agent self-intro ("who are you") for Edith verified');

// 4. Orchestrator & Tool Integration
const mockGemini = {
  activeModel: 'gemini-2.5-flash',
  chatClient: {
    interactions: {
      async create({ input }) {
        return {
          output_text: JSON.stringify({
            edit_title: 'Sample Edit',
            summary: 'Video cut complete',
            timeline_cuts: [{ cut_number: 1, start: '00:00:10', end: '00:00:30', description: 'Action clip' }],
            ffmpeg_command: 'ffmpeg -ss 00:00:10 -to 00:00:30 -i input.mp4 -c copy output.mp4',
            spoken_response: 'I have formulated your video edit blueprint, sir.',
            document_title: 'Edited Doc',
            summary_of_changes: 'Polished',
            revised_sections: [{ heading: 'Summary', body: 'Executive summary.' }]
          }),
        };
      },
    },
  },
};

const orchestrator = new TeamOrchestrator(mockGemini);
assert.ok(orchestrator.edith, 'Orchestrator must have edith instantiated');
console.log('✔ TeamOrchestrator contains EdithAgent instance');

// Test Edith Agent Methods
const vidEdit = await orchestrator.edith.editVideo({
  input_file: 'sample.mp4',
  instructions: 'Cut highlights from 10s to 30s',
  start_time: '00:00:10',
  end_time: '00:00:30',
});
assert.ok(vidEdit.ok, 'editVideo must succeed');
console.log('✔ Edith editVideo executed successfully:', vidEdit.summary);

const docEdit = await orchestrator.edith.editDocument({
  document_name: 'QuarterlyReport.docx',
  instructions: 'Refine executive tone',
  style: 'executive',
});
assert.ok(docEdit.ok, 'editDocument must succeed');
console.log('✔ Edith editDocument executed successfully:', docEdit.summary);

// Test ComputerController Tool Declaration and Dispatch
const controller = new ComputerController({});
controller.setOrchestrator(orchestrator);

const toolDecls = controller.getToolDeclarations();
const edithTool = toolDecls.find((t) => t.name === 'delegate_to_edith');
assert.ok(edithTool, 'delegate_to_edith tool must be declared in ComputerController');
console.log('✔ delegate_to_edith declared in tools with actions:', edithTool.parameters.properties.action.enum);

const toolExec = await controller.executeTool('delegate_to_edith', {
  action: 'edit_video',
  target: 'my_clip.mp4',
  instructions: 'Trim 10 seconds from beginning',
  start_time: '00:00:10',
});
const parsedExec = JSON.parse(toolExec.text);
assert.ok(parsedExec.ok, 'delegate_to_edith tool execution must succeed');
console.log('✔ ComputerController executed delegate_to_edith successfully');

console.log('\n[ALL EDITH AGENT TESTS PASSED 100%!]');
