// Pure helpers for the lines the recorder sends and reads. No I/O, so tests can import them.

// The initialize control request. sdkMcpServers / webSearchIsolationExemptMcpServers must be string arrays.
// hooks maps an event name to [{matcher?, hookCallbackIds, timeout?}] and is {} when the scenario declares none.
export function initializeRequest(hooks = {}) {
  return {
    subtype: 'initialize',
    hooks,
    sdkMcpServers: [],
    webSearchIsolationExemptMcpServers: [],
  };
}

// The key a waitFor step counts a line under: control_request/<subtype>, <type>/<subtype>, or the bare type. A command_lifecycle line counts under command_lifecycle/<state>.
export function kindOf(o) {
  if (o.type === 'command_lifecycle' && o.state) return `command_lifecycle/${o.state}`;
  if (o.type === 'control_request') return `control_request/${o.request?.subtype}`;
  if (o.subtype) return `${o.type}/${o.subtype}`;
  return String(o.type);
}

// Runs a scene's respond(req, ctx) for a hook_callback or elicitation request. A throw inside it (a scene that touches files, say)
// comes back as an Error that names the request, so the caller can fail the recording instead of crashing in a stream handler.
export function sceneAnswer(answerer, req, ctx) {
  try {
    const { holdMs = 0, payload } = answerer.respond(req, ctx);
    return { holdMs, payload };
  } catch (e) {
    throw new Error(`the scene's answer to ${req?.subtype} failed: ${e.message}`);
  }
}

// The answer to a can_use_tool request: the scene's permission.respond(req, {index, cwd}), or allow with the input as is.
// index counts the can_use_tool requests of the scene from 0 (as for hook_callback).
export function permissionAnswer(permission, req, index, cwd) {
  if (!permission?.respond) return { behavior: 'allow', updatedInput: req.input };
  return permission.respond(req, { index, cwd });
}
