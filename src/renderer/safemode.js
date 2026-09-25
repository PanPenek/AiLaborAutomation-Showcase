/**
 * safemode.js: all-ages safe mode (showcase build).
 *
 * Every prompt that reaches an image, image-edit or video generator passes through
 * SafeMode.check() first; a prompt containing adult terms is refused before
 * anything is rendered. The word list is matched on whole words, so ordinary words
 * that merely contain a blocked sequence are not affected.
 * Tested by tools/test.mjs (npm test).
 */
(function () {
  /**
   * Whole-word list of adult terms. Word boundaries (\b) matter: "bra" is blocked,
   * "brass" and "zebra" are not. `i` makes the match case-insensitive.
   */
  const BLOCK = /\b(nsfw|nude|nudity|naked|topless|bottomless|undress\w*|lingerie|underwear|panties|bra|bras|bikinis?|thongs?|sexy|sexual\w*|sex|erotic\w*|porn\w*|hentai|ecchi|lewd|fetish\w*|kinky?|bdsm|bondage|breasts?|boobs?|nipples?|cleavage|busty|genitals?|seductive|suggestive|provocative|sensual|explicit|r-?18|adult content|uncensored|onlyfans|strip(?:ping|per|tease))\b/i;

  const SafeMode = {
    enabled: true,
    /** Throw if `text` contains an adult term; otherwise return it unchanged. */
    check(text) {
      const m = String(text || '').match(BLOCK);
      if (m) throw new Error(`Safe mode: blocked a prompt containing "${m[0]}". This build is all-ages only.`);
      return text;
    },
  };
  // Browser (renderer) gets a global; Node (tests) gets a module export.
  if (typeof window !== 'undefined') window.SafeMode = SafeMode;
  if (typeof module !== 'undefined') module.exports = SafeMode;
})();
