document.querySelectorAll('.thumbnail img').forEach(image=>{
  const fallback=()=>{image.hidden=true;image.nextElementSibling.hidden=false;};
  image.addEventListener('error',fallback,{once:true});
  if(image.complete&&image.naturalWidth===0)fallback();
});
