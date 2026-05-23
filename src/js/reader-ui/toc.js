export function enhanceTOC() {
  var quartoTOC = document.getElementById('TOC') || document.getElementById('TableOfContents');
  var mainTOC = document.getElementById('main-toc');

  if (quartoTOC && mainTOC) {
    mainTOC.replaceChildren();
    mainTOC.appendChild(quartoTOC.cloneNode(true));
  }

  document.querySelectorAll('.chapter').forEach(function (chapter) {
    var id = chapter.id || '';
    var match = id.match(/chapter-(\d+)/) || id.match(/(\d+)/);
    if (match) chapter.setAttribute('data-chapter', match[1]);
  });

  document.querySelectorAll('.toc a').forEach(function (link) {
    var href = link.getAttribute('href') || '';
    var match = href.match(/chapter-(\d+)/);
    var item = link.closest('.toc-item, li');
    if (match && item) item.setAttribute('data-chapter', match[1]);
  });
}

export function copyTOCToDrawer() {
  var drawerTOC = document.getElementById('drawer-toc');
  var mainTOC = document.getElementById('main-toc');
  if (!drawerTOC || !mainTOC) return;
  drawerTOC.replaceChildren();
  Array.from(mainTOC.childNodes).forEach(function (node) {
    drawerTOC.appendChild(node.cloneNode(true));
  });
}
