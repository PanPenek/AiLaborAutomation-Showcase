// Showcase build: all-ages safe mode. Every prompt that reaches an image or video
// generator passes through SafeMode.check(); anything adult is refused before rendering.
(function () {
  const BLOCK = /\b(nsfw|nude|nudity|naked|topless|bottomless|undress\w*|lingerie|underwear|panties|bra|bras|bikinis?|thongs?|sexy|sexual\w*|sex|erotic\w*|porn\w*|hentai|ecchi|lewd|fetish\w*|kinky?|bdsm|bondage|breasts?|boobs?|nipples?|cleavage|busty|genitals?|seductive|suggestive|provocative|sensual|explicit|r-?18|adult content|uncensored|onlyfans|strip(?:ping|per|tease))\b/i;
  const SafeMode = {
    enabled: true,
    check(text) {
      const m = String(text || '').match(BLOCK);
      if (m) throw new Error(`Safe mode: blocked a prompt containing "${m[0]}". This build is all-ages only.`);
      return text;
    },
  };
  if (typeof window !== 'undefined') window.SafeMode = SafeMode;
  if (typeof module !== 'undefined') module.exports = SafeMode;
})();
