export function FacebookIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="18" r="18" fill="#1877F2" />
      <path
        d="M24.5 18.5l.6-4.2h-4v-2.7c0-1.15.35-1.93 1.98-1.93h2.1V6.4c-.37-.05-1.6-.15-3.05-.15-3.02 0-5.08 1.85-5.08 5.24v2.9h-3.4v4.2h3.4V29h4.05v-10.5h3.4z"
        fill="#fff"
      />
    </svg>
  );
}

export function InstagramIcon({ size = 28 }: { size?: number }) {
  const gradientId = "kaaya-instagram-gradient";
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={gradientId} cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#FFDD55" />
          <stop offset="10%" stopColor="#FFDD55" />
          <stop offset="50%" stopColor="#FF543E" />
          <stop offset="100%" stopColor="#C837AB" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="36" height="36" rx="9" fill={`url(#${gradientId})`} />
      <rect x="9.5" y="9.5" width="17" height="17" rx="5.5" stroke="#fff" strokeWidth="2" />
      <circle cx="18" cy="18" r="5" stroke="#fff" strokeWidth="2" />
      <circle cx="26.2" cy="9.8" r="1.4" fill="#fff" />
    </svg>
  );
}
