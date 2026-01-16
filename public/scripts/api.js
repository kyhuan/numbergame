async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error || "请求失败";
    throw new Error(message);
  }
  return data;
}

async function requireAuth() {
  try {
    const data = await fetchJson("/api/me");
    return data.user;
  } catch (error) {
    location.href = "auth.html";
    return null;
  }
}

async function logout() {
  await fetchJson("/api/logout", { method: "POST" });
  location.href = "auth.html";
}
