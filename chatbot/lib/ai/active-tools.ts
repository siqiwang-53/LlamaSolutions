const CORE_TOOL_NAMES = [
  "createDocument",
  "editDocument",
  "getWeather",
  "requestSuggestions",
  "updateDocument",
] as const;

const SEARCH_TOOL_NAMES = ["webSearch", "searchNews"] as const;

export function buildActiveToolNames({
  isReasoningModel,
  supportsTools,
  webSearchEnabled,
}: {
  isReasoningModel: boolean;
  supportsTools: boolean;
  webSearchEnabled: boolean;
}) {
  if (isReasoningModel && !supportsTools) {
    return [];
  }

  const names: string[] = ["getWeather"];
  if (webSearchEnabled) {
    names.push(...SEARCH_TOOL_NAMES);
  }
  names.push(
    "createDocument",
    "editDocument",
    "updateDocument",
    "requestSuggestions"
  );
  return names;
}

export function includesSearchTools(names: readonly string[]) {
  return SEARCH_TOOL_NAMES.every((name) => names.includes(name));
}

export function includesCoreTools(names: readonly string[]) {
  return CORE_TOOL_NAMES.every((name) => names.includes(name));
}
