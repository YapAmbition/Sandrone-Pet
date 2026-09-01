const text = document.querySelector('#text');
const bubble = document.querySelector('.bubble');
window.speechAPI.onText((value) => {
  text.textContent = value;
  text.style.fontSize = '17px';
  let size = 17;
  while (text.scrollWidth > bubble.clientWidth - 32 && size > 8) {
    size -= 0.5;
    text.style.fontSize = `${size}px`;
  }
});
