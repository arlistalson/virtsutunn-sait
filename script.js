document.getElementById("year").textContent = new Date().getFullYear();

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
