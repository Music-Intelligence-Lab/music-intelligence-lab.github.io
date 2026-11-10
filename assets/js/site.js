/* Videos stay a picture until someone asks for them, so nothing from YouTube
   loads for people who only came to read. */
document.querySelectorAll('[data-yt]').forEach(function (a) {
  a.addEventListener('click', function (e) {
    e.preventDefault();
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + a.getAttribute('data-yt') + '?autoplay=1';
    f.title = a.getAttribute('data-title') || 'Video';
    f.allow = 'autoplay; encrypted-media; picture-in-picture';
    f.allowFullscreen = true;
    a.replaceWith(Object.assign(document.createElement('div'), { className: 'poster poster--live' }));
    document.querySelector('.poster--live:empty').appendChild(f);
    f.focus();
  });
});
