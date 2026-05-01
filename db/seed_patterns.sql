INSERT INTO patterns (id, name, description, category, complexity, icon, tags, template_nodes, template_connections, entry_node_id, exit_node_ids, is_built_in, is_public)
VALUES
(
  'chain-of-thought',
  'Chain of Thought',
  'Sequential reasoning: break a problem into 3 explicit thinking steps before producing an answer.',
  'reasoning', 'simple', E'\U0001F517',
  ARRAY['reasoning','steps','cot','thinking'],
  '[{"id":"p-cot-1","type":"STEP","label":"Analyse Problem","description":"Identify the core problem, constraints, and what success looks like.","config":{},"position":{"x":0,"y":0}},{"id":"p-cot-2","type":"STEP","label":"Reason Through","description":"Work through the problem step-by-step, considering alternatives.","config":{},"position":{"x":0,"y":120}},{"id":"p-cot-3","type":"STEP","label":"Formulate Answer","description":"Synthesise findings into a clear, justified final answer.","config":{},"position":{"x":0,"y":240}}]',
  '[{"id":"p-cot-c1","source":"p-cot-1","target":"p-cot-2"},{"id":"p-cot-c2","source":"p-cot-2","target":"p-cot-3"}]',
  'p-cot-1', ARRAY['p-cot-3'], true, false
),
(
  'self-critique',
  'Self-Critique Loop',
  'Generate a response, evaluate quality, and retry if it does not meet the bar.',
  'reasoning', 'simple', E'\U0001F504',
  ARRAY['critique','retry','loop','quality'],
  '[{"id":"p-sc-1","type":"ACTION","label":"Generate Response","description":"Produce an initial response or solution.","config":{},"position":{"x":0,"y":0}},{"id":"p-sc-2","type":"GUARD","label":"Quality Check","description":"Evaluate the response: is it accurate, complete, and on-topic?","config":{},"position":{"x":0,"y":120}},{"id":"p-sc-3","type":"DECISION","label":"Accept or Retry?","description":"If quality passes, proceed. If not, regenerate.","config":{},"position":{"x":0,"y":240}}]',
  '[{"id":"p-sc-c1","source":"p-sc-1","target":"p-sc-2"},{"id":"p-sc-c2","source":"p-sc-2","target":"p-sc-3"},{"id":"p-sc-c3","source":"p-sc-3","target":"p-sc-1","condition":"retry"}]',
  'p-sc-1', ARRAY['p-sc-1','p-sc-3'], true, false
),
(
  'input-guard',
  'Input Guard',
  'Validate incoming input before processing. Reject invalid input early.',
  'validation', 'simple', E'\U0001F6E1\UFE0F',
  ARRAY['validation','guard','input','safety'],
  '[{"id":"p-ig-1","type":"GUARD","label":"Validate Input","description":"Check that the input meets required format, length, and content rules.","config":{},"position":{"x":0,"y":0}},{"id":"p-ig-2","type":"CONDITION","label":"Valid or Invalid?","description":"Route valid input to processing. Reject invalid input with a clear error message.","config":{},"position":{"x":0,"y":120}}]',
  '[{"id":"p-ig-c1","source":"p-ig-1","target":"p-ig-2"}]',
  'p-ig-1', ARRAY['p-ig-2'], true, false
),
(
  'schema-validator',
  'Schema Validator',
  'Apply a schema rule, check compliance, and resolve mismatches gracefully.',
  'validation', 'simple', E'\U0001F4D0',
  ARRAY['schema','format','validation','data'],
  '[{"id":"p-sv-1","type":"RULE","label":"Schema Rule","description":"Define the expected data schema, required fields, and types.","config":{},"position":{"x":0,"y":0}},{"id":"p-sv-2","type":"CONDITION","label":"Schema Check","description":"Check whether input conforms to the schema rule.","config":{},"position":{"x":0,"y":120}},{"id":"p-sv-3","type":"RESOLUTION","label":"Handle Mismatch","description":"If schema violation detected, coerce, fix, or return an error to the caller.","config":{},"position":{"x":0,"y":240}}]',
  '[{"id":"p-sv-c1","source":"p-sv-1","target":"p-sv-2"},{"id":"p-sv-c2","source":"p-sv-2","target":"p-sv-3","condition":"invalid"}]',
  'p-sv-1', ARRAY['p-sv-3'], true, false
),
(
  'graceful-fallback',
  'Graceful Fallback',
  'Try the primary action; if it fails, execute a fallback rather than erroring out.',
  'error-handling', 'simple', E'\U0001FA82',
  ARRAY['fallback','error','resilience','try-catch'],
  '[{"id":"p-gf-1","type":"CONDITION","label":"Try Primary Path?","description":"Decide whether the primary action is available and safe to attempt.","config":{},"position":{"x":0,"y":0}},{"id":"p-gf-2","type":"ACTION","label":"Primary Action","description":"The preferred action to take when conditions allow.","config":{},"position":{"x":-140,"y":120}},{"id":"p-gf-3","type":"ACTION","label":"Fallback Action","description":"A safe alternative when the primary action is unavailable or fails.","config":{},"position":{"x":140,"y":120}}]',
  '[{"id":"p-gf-c1","source":"p-gf-1","target":"p-gf-2","condition":"available"},{"id":"p-gf-c2","source":"p-gf-1","target":"p-gf-3","condition":"unavailable"}]',
  'p-gf-1', ARRAY['p-gf-2','p-gf-3'], true, false
),
(
  'retry-escalate',
  'Retry & Escalate',
  'Attempt an action, check the result, retry on transient failure, and escalate if retries are exhausted.',
  'error-handling', 'simple', E'\U0001F199',
  ARRAY['retry','escalate','error','handoff'],
  '[{"id":"p-re-1","type":"ACTION","label":"Attempt Action","description":"Execute the primary action.","config":{},"position":{"x":0,"y":0}},{"id":"p-re-2","type":"GUARD","label":"Check Result","description":"Did the action succeed? Inspect output for errors or partial failure.","config":{},"position":{"x":0,"y":120}},{"id":"p-re-3","type":"DECISION","label":"Retry or Escalate?","description":"On failure: retry if attempts remain, otherwise escalate to a human or senior system.","config":{},"position":{"x":0,"y":240}},{"id":"p-re-4","type":"HANDOFF","label":"Escalate","description":"Hand off to a human agent or escalation system with full context of the failure.","config":{},"position":{"x":0,"y":360}}]',
  '[{"id":"p-re-c1","source":"p-re-1","target":"p-re-2"},{"id":"p-re-c2","source":"p-re-2","target":"p-re-3","condition":"failed"},{"id":"p-re-c3","source":"p-re-3","target":"p-re-1","condition":"retry"},{"id":"p-re-c4","source":"p-re-3","target":"p-re-4","condition":"escalate"}]',
  'p-re-1', ARRAY['p-re-4'], true, false
),
(
  'priority-router',
  'Priority Router',
  'Route incoming requests to one of three paths based on priority, type, or criteria.',
  'routing', 'simple', E'\U0001F6A6',
  ARRAY['routing','decision','branch','priority'],
  '[{"id":"p-pr-1","type":"DECISION","label":"Route by Priority","description":"Classify the request and route it to the appropriate handler.","config":{},"position":{"x":0,"y":0}},{"id":"p-pr-2","type":"OPTION","label":"High Priority","description":"Handle urgent or critical requests immediately.","config":{},"position":{"x":-200,"y":140}},{"id":"p-pr-3","type":"OPTION","label":"Normal Priority","description":"Handle standard requests through the default flow.","config":{},"position":{"x":0,"y":140}},{"id":"p-pr-4","type":"OPTION","label":"Low Priority","description":"Defer or batch low-priority requests.","config":{},"position":{"x":200,"y":140}}]',
  '[{"id":"p-pr-c1","source":"p-pr-1","target":"p-pr-2","condition":"high"},{"id":"p-pr-c2","source":"p-pr-1","target":"p-pr-3","condition":"normal"},{"id":"p-pr-c3","source":"p-pr-1","target":"p-pr-4","condition":"low"}]',
  'p-pr-1', ARRAY['p-pr-2','p-pr-3','p-pr-4'], true, false
),
(
  'fan-out-aggregator',
  'Fan-out Aggregator',
  'Split work across two parallel actions, then aggregate results into one response.',
  'routing', 'simple', E'\U0001F578\UFE0F',
  ARRAY['parallel','aggregate','fan-out','merge'],
  '[{"id":"p-fa-1","type":"DECISION","label":"Fan Out","description":"Split the request into parallel workloads.","config":{},"position":{"x":0,"y":0}},{"id":"p-fa-2","type":"ACTION","label":"Worker A","description":"Process the first portion of the workload.","config":{},"position":{"x":-140,"y":140}},{"id":"p-fa-3","type":"ACTION","label":"Worker B","description":"Process the second portion of the workload.","config":{},"position":{"x":140,"y":140}},{"id":"p-fa-4","type":"RESOLUTION","label":"Aggregate Results","description":"Merge results from all workers into a single coherent response.","config":{},"position":{"x":0,"y":280}}]',
  '[{"id":"p-fa-c1","source":"p-fa-1","target":"p-fa-2"},{"id":"p-fa-c2","source":"p-fa-1","target":"p-fa-3"},{"id":"p-fa-c3","source":"p-fa-2","target":"p-fa-4"},{"id":"p-fa-c4","source":"p-fa-3","target":"p-fa-4"}]',
  'p-fa-1', ARRAY['p-fa-4'], true, false
),
(
  'context-accumulator',
  'Context Accumulator',
  'Read prior context from memory, enrich with current processing, and write updated context back.',
  'memory', 'simple', E'\U0001F9E0',
  ARRAY['memory','context','state','accumulate'],
  '[{"id":"p-ca-1","type":"MEMORY","label":"Read Context","description":"Load relevant prior context from memory (conversation history, user profile, session state).","config":{},"position":{"x":0,"y":0}},{"id":"p-ca-2","type":"ACTION","label":"Process with Context","description":"Execute the task using loaded context to produce an informed output.","config":{},"position":{"x":0,"y":140}},{"id":"p-ca-3","type":"MEMORY","label":"Update Context","description":"Persist new information and updated state back to memory for future turns.","config":{},"position":{"x":0,"y":280}}]',
  '[{"id":"p-ca-c1","source":"p-ca-1","target":"p-ca-2"},{"id":"p-ca-c2","source":"p-ca-2","target":"p-ca-3"}]',
  'p-ca-1', ARRAY['p-ca-3'], true, false
),
(
  'safe-tool-wrapper',
  'Safe Tool Wrapper',
  'Validate before calling a tool, call it, then inspect the result with a guard at each step.',
  'integration', 'simple', E'\U0001F527',
  ARRAY['tool','integration','safety','wrapper'],
  '[{"id":"p-tw-1","type":"GUARD","label":"Pre-call Validation","description":"Verify inputs and permissions before invoking the external tool.","config":{},"position":{"x":0,"y":0}},{"id":"p-tw-2","type":"TOOL","label":"Tool Call","description":"Invoke the external tool or service with validated parameters.","config":{},"position":{"x":0,"y":140}},{"id":"p-tw-3","type":"CONDITION","label":"Check Tool Result","description":"Inspect the tool response: success path or error handling path.","config":{},"position":{"x":0,"y":280}}]',
  '[{"id":"p-tw-c1","source":"p-tw-1","target":"p-tw-2"},{"id":"p-tw-c2","source":"p-tw-2","target":"p-tw-3"}]',
  'p-tw-1', ARRAY['p-tw-3'], true, false
)
ON CONFLICT (id) DO NOTHING;
