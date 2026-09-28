/**
 * Theme plumbing shared by the root layout (a server component) and the toggle.
 * A plain module on purpose: a constant exported from a "use client" module is
 * a client reference on the server, not the string.
 */
export const THEME_KEY = "cp:theme";

/** Runs before first paint so a stored choice never flashes the other theme. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}})();`;

export const THEME_COLORS = { light: "#ede3c8", dark: "#12100c" } as const;
