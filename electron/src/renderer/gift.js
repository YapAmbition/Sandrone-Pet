const button = document.querySelector('#gift');
const image = document.querySelector('#gift-image');

window.giftAPI.onPresentation((presentation) => {
  if (presentation?.type === 'show') {
    image.src = presentation.imageUrl;
    image.alt = presentation.name || '多涅找到的物品';
    button.classList.remove('visible', 'reacting');
    void button.offsetWidth;
    button.classList.add('visible');
  } else if (presentation?.type === 'reaction') {
    button.classList.remove('reacting');
    void button.offsetWidth;
    button.classList.add('reacting');
  } else if (presentation?.type === 'hide') {
    button.classList.remove('visible', 'reacting');
    image.removeAttribute('src');
  }
});

button.addEventListener('click', () => window.giftAPI.tapped());
window.giftAPI.rendererReady();
