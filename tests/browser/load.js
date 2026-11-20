// Loads the card under test: the page's ?bundle= (a path from this folder),
// or the built card.
const bundle = new URLSearchParams(location.search).get("bundle") || "../../dist/prusa-connect-card.js";
document.write(`<script src="${bundle}"><\/script>`);
