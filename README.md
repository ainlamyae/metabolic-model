# Metabolic Model

An interactive, first-principles model of the metabolic math behind weight management — BMR, activity burn, the thermic effect of food, sleep-deprivation effects, macro targets, and body-mass trajectory — served as a static site with a live calculation sheet.

Live site: <https://ainlamyae.github.io/metabolic-model/>

## Disclaimer

This model is provided for educational and informational purposes only and is not a medical source. It does not constitute medical, dietary, or clinical advice, and the author accepts no responsibility or liability for any decision or outcome arising from its use. Consult a qualified medical practitioner or licensed dietitian or nutritionist before making any change to your diet, activity, or body mass.

## Files

- `index.html` — page loader; fetches and assembles the files below into the page, with the disclaimer, the QR code, and the contents sidebar.
- `content/1 Human Metabolic System Diagram.html` / `.tex` — the system block diagram (SVG for the site, TikZ for LaTeX).
- `content/2 Human Metabolic System Model.tex` — the model's text and equations, as a LaTeX content fragment.
- `content/3 Glossary.tex` — acronyms, symbols and variables, subscripts and indices.
- `content/4 References.bib` — the model's bibliography, as plain BibTeX.
- `content/5 Interactive Calculation Sheet.html` — the interactive calculator UI.
- `assets/script.js` / `assets/style.css` — page logic and styling.
- `assets/qr-metabolic-model.svg` — QR code linking to the live site.
- `favicon.svg` — site icon.

This file is documentation only — it is never fetched or rendered by the site itself.

## Copyright

© 2026 [ALI](https://ainlamyae.github.io). All rights reserved.
