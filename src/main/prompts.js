const PATREON_LINE = link => link;

function ideationPrompt({theme: theme, example: example, count: count}) {
  return `You are a creative director for an anime-style, strictly all-ages AI art studio. Everything you write must be strictly safe-for-work and all-ages: no nudity, no sexual or suggestive content, no revealing outfits, fully clothed characters, family-friendly scenes only. Your job is to write image-generation prompts.\n\nTheme to explore: "${theme}"\n${example ? `\nHere is an example prompt from the artist showing the style and level of detail to imitate:\n"""${example}"""\n` : ''}\nWrite ${count} DISTINCT, highly detailed image prompts for an anime image generator. Rules:\n- Each prompt describes ONE scene: character(s), body details, outfit, pose, expression, setting, lighting, camera angle.\n- Be clear and specific about the theme — the audience wants variety within the theme.\n- Vary composition: different poses, angles, settings, moods across the ${count} prompts.\n- 40-90 words each. No preamble, no numbering commentary.\n- Quality tags style is fine (e.g. "masterpiece, best quality" prefixes are allowed but not required).\n\nRespond ONLY with a JSON array of strings: ["prompt1", "prompt2", ...]`;
}

function qcPrompt() {
  return `You are a ruthless AI-generated image quality inspector. Examine this image closely for generation artifacts and anatomical defects.\n\nCheck specifically for:\n- Hands/fingers: extra fingers, missing fingers, fused fingers, malformed hands\n- Limbs: extra limbs, missing limbs, limbs bending wrong, disconnected limbs\n- Face: distorted/asymmetric/melted facial features, dead/wonky eyes, broken mouth\n- Anatomy: impossible body proportions, twisted torso, broken joints\n- Image defects: watermarks, embedded text/signature artifacts, heavy jpeg artifacts, smearing, blur in focal areas, duplicated body parts, objects merging into skin\n- Composition: unintended cropping of the subject's head/face\n\nScore the image 1-10 (10 = flawless, professional; 7 = minor issues only; 5 = noticeable artifacts; 1 = broken).\n\nRespond ONLY with JSON:\n{"score": <1-10>, "verdict": "PASS"|"FAIL", "defects": ["..."], "notes": "one sentence overall impression"}\nVerdict PASS only if score >= 7 and there are no major anatomical defects.`;
}

function metadataPrompt({prompt: prompt, qcNotes: qcNotes, exampleStyle: exampleStyle, maxTags: maxTags}) {
  return `You write DeviantArt submission metadata for all-ages anime-style AI art posts. Everything you write must be strictly safe-for-work and all-ages: no nudity, no sexual or suggestive content, no revealing outfits, fully clothed characters, family-friendly scenes only.\n\nThe image was generated from this prompt:\n"""${prompt}"""\n${qcNotes ? `Inspector notes about the image: ${qcNotes}` : ''}\n${exampleStyle ? `\nMimic the tone/style of this example metadata from the artist:\n"""${exampleStyle}"""\n` : ''}\nGenerate:\n1. "title": catchy, tasteful, max 60 characters. No quotes, no hashtags.\n2. "description": 2-4 sentences. Artistic, warm and family-friendly. Describes the scene, mood, and aesthetic. Do NOT include any URLs or Patreon mentions — that gets prepended separately.\n3. "tags": array of ${maxTags} relevant DeviantArt tags. Lowercase, single words (letters/numbers only, no spaces, no hyphens). Mix subject tags, style tags, and theme tags.\n\nRespond ONLY with JSON: {"title": "...", "description": "...", "tags": ["...", "..."]}`;
}

function cleanTag(tag) {
  return String(tag || '').trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 60);
}

function buildDescription(patreonLink, cta, aiDescription, destination = 'deviantart') {
  const body = String(aiDescription || '').replace(/https?:\/\/\S*patreon\S*/gi, '').trim();
  if (destination === 'patreon') return body;
  const linkLine = PATREON_LINE(patreonLink);
  return `${linkLine}\n\n${cta}\n\n${body}`.trim();
}

function finalizeTags(aiTags, defaultTags, maxTags) {
  const out = [];
  const seen = new Set;
  for (const t of [ ...aiTags || [], ...defaultTags || [] ]) {
    const c = cleanTag(t);
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
    if (out.length >= maxTags) break;
  }
  return out;
}

module.exports = {
  ideationPrompt: ideationPrompt,
  qcPrompt: qcPrompt,
  metadataPrompt: metadataPrompt,
  cleanTag: cleanTag,
  buildDescription: buildDescription,
  finalizeTags: finalizeTags
};
