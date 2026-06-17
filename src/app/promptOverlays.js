export function appendPromptOverlay(prompt, config, target) {
  let output = prompt;
  output = appendOverlayText(output, config.promptOverlays?.all);
  output = appendOverlayText(output, config.promptOverlays?.[target]);
  return output;
}

function appendOverlayText(prompt, overlay) {
  if (typeof overlay !== "string" || !overlay.trim()) {
    return prompt;
  }
  let output = prompt;
  if (output && !output.endsWith("\n\n")) {
    output += "\n\n";
  }
  return output + overlay.replace(/^\n+|\n+$/g, "");
}
