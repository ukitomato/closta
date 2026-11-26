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

// The key a waitFor step counts a line under: control_request/<subtype>, <type>/<subtype>, or the bare type.
export function kindOf(o) {
  if (o.type === 'control_request') return `control_request/${o.request?.subtype}`;
  if (o.subtype) return `${o.type}/${o.subtype}`;
  return String(o.type);
}
