const nav=document.getElementById('nav'),menu=document.getElementById('menu'),modal=document.getElementById('modal'),close=document.getElementById('close');
addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>20),{passive:true});
menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',open);menu.textContent=open?'×':'☰'});
document.querySelectorAll('.nav-links a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.textContent='☰'}));
const showModal=()=>{modal.classList.add('open');document.body.classList.add('locked')};
const hideModal=()=>{modal.classList.remove('open');document.body.classList.remove('locked')};
document.querySelectorAll('.open-modal').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();showModal()}));close.addEventListener('click',hideModal);modal.addEventListener('click',e=>{if(e.target===modal)hideModal()});addEventListener('keydown',e=>{if(e.key==='Escape')hideModal()});
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}}),{threshold:.12});document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
