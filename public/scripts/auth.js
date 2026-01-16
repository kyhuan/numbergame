const toggleLogin = document.getElementById("toggleLogin");
const toggleRegister = document.getElementById("toggleRegister");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authNotice = document.getElementById("authNotice");

function setMode(mode) {
  const isLogin = mode === "login";
  toggleLogin.classList.toggle("active", isLogin);
  toggleRegister.classList.toggle("active", !isLogin);
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  authNotice.textContent = "";
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "操作失败");
  }
  return data;
}

toggleLogin.addEventListener("click", () => setMode("login"));
toggleRegister.addEventListener("click", () => setMode("register"));

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authNotice.textContent = "";
  const formData = new FormData(loginForm);
  try {
    await postJson("/api/login", {
      username: formData.get("username"),
      password: formData.get("password"),
    });
    location.href = "lobby.html";
  } catch (error) {
    authNotice.textContent = error.message;
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authNotice.textContent = "";
  const formData = new FormData(registerForm);
  try {
    await postJson("/api/register", {
      username: formData.get("username"),
      password: formData.get("password"),
      email: formData.get("email"),
      phone: formData.get("phone"),
    });
    location.href = "lobby.html";
  } catch (error) {
    authNotice.textContent = error.message;
  }
});

fetch("/api/me")
  .then((response) => (response.ok ? response.json() : null))
  .then((data) => {
    if (data && data.user) {
      location.href = "lobby.html";
    }
  })
  .catch(() => {});
