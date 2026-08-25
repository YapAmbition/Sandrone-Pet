const text = document.querySelector('#text');
window.speechAPI.onText((value) => { text.textContent = value; });
