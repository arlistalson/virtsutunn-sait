// Year
document.getElementById("year").textContent = new Date().getFullYear();

var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Booking form (Formspree AJAX) ---------- */
(function () {
  var form = document.querySelector(".booking-form");
  if (!form) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Saadan…";
    fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: { "Accept": "application/json" }
    }).then(function (res) {
      if (!res.ok) throw new Error("send failed");
      form.hidden = true;
      document.querySelector(".form-success").hidden = false;
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = "Saada broneeringusoov";
      alert("Saatmine ebaõnnestus. Palun proovi uuesti või kirjuta otse: arlistalson@gmail.com");
    });
  });
})();

/* ---------- Sticky nav: solid on scroll + mobile menu ---------- */
(function () {
  var header = document.getElementById("siteHeader");
  var toggle = document.getElementById("navToggle");
  var links = document.getElementById("navLinks");
  if (!header) return;

  function onScroll() {
    header.classList.toggle("scrolled", window.scrollY > 24);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = header.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Sulge menüü" : "Ava menüü");
    });
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        header.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }
})();

/* ---------- Reveal on scroll (staggered) ---------- */
(function () {
  var els = document.querySelectorAll(".reveal");
  if (!els.length) return;
  if (reduceMotion || !("IntersectionObserver" in window)) {
    els.forEach(function (el) { el.classList.add("in"); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
  els.forEach(function (el) { io.observe(el); });
})();

/* ---------- Number counters ---------- */
(function () {
  var nums = document.querySelectorAll("[data-count]");
  if (!nums.length) return;
  if (reduceMotion || !("IntersectionObserver" in window)) return;

  function animate(el) {
    var target = parseInt(el.getAttribute("data-count"), 10);
    var start = null;
    var dur = 1200;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        animate(entry.target);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.6 });
  nums.forEach(function (el) { io.observe(el); });
})();

/* ---------- Gallery slider ---------- */
(function () {
  var track = document.getElementById("galleryTrack");
  var dotsWrap = document.getElementById("galleryDots");
  if (!track || !dotsWrap) return;
  var slides = track.querySelectorAll("img");
  slides.forEach(function (_, i) {
    var d = document.createElement("button");
    d.type = "button";
    d.className = "gallery-dot" + (i === 0 ? " active" : "");
    d.setAttribute("aria-label", "Pilt " + (i + 1));
    d.addEventListener("click", function () { goTo(i); });
    dotsWrap.appendChild(d);
  });
  var dots = dotsWrap.querySelectorAll(".gallery-dot");
  function current() { return Math.round(track.scrollLeft / track.clientWidth); }
  function goTo(i) {
    i = (i + slides.length) % slides.length;
    track.scrollTo({ left: i * track.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
  }
  document.querySelector(".gallery-prev").addEventListener("click", function () { goTo(current() - 1); });
  document.querySelector(".gallery-next").addEventListener("click", function () { goTo(current() + 1); });
  track.addEventListener("scroll", function () {
    var i = current();
    dots.forEach(function (d, j) { d.classList.toggle("active", j === i); });
  }, { passive: true });
})();
