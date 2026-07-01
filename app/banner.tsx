'use client';

import { useEffect, useState } from "react";

export function Banner() {
  const [consentGiven, setConsentGiven] = useState('');

  useEffect(() => {
    setConsentGiven('pending');
  }, []);

  if (consentGiven !== 'pending') return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
      }}
    >
      <p>
        We use tracking cookies to understand how you use 
        the product and help us improve it.
        Please accept cookies to help us improve.
      </p>

      <button type="button" onClick={() => setConsentGiven("accepted")}>
        Accept cookies
      </button>

      <span> </span>

      <button type="button" onClick={() => setConsentGiven("declined")}>
        Decline cookies
      </button>
    </div>
  );
}