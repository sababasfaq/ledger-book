import { useState } from "react";
import { auth } from "../lib/firebase";
import { getRecaptcha } from "../lib/recaptcha";
import {
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
} from "firebase/auth";
import { useNavigate } from "react-router-dom";

export default function EnrollPhoneMFA() {
  const nav = useNavigate();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [msg, setMsg] = useState("");

  const sendCode = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return setMsg("Please log in first.");
      const session = await multiFactor(user).getSession();

      const appVerifier = getRecaptcha();
      const provider = new PhoneAuthProvider(auth);

      const vid = await provider.verifyPhoneNumber(
        { phoneNumber: phone, session: session }, // enrollment session
        appVerifier
      );
      setVerificationId(vid);
      setMsg("Code sent. Check SMS (or use test code you configured).");
    } catch (e) {
      setMsg(e.message);
    }
  };

  const confirm = async () => {
    try {
      const cred = PhoneAuthProvider.credential(verificationId, code);
      const assertion = PhoneMultiFactorGenerator.assertion(cred);
      await multiFactor(auth.currentUser).enroll(assertion, "Office phone");
      setMsg("2-step enabled!");
      nav("/dashboard", { replace: true });
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <article className="max-w-md mx-auto p-6 bg-white border rounded" aria-labelledby="mfa-title">
      <header>
        <h1 id="mfa-title" className="text-lg font-semibold mb-3">Enable SMS 2-Step</h1>
      </header>

      <section aria-label="Step 1: Phone Number" className="mb-4">
        <label htmlFor="mfa-phone" className="sr-only">Phone Number</label>
        <input 
          id="mfa-phone"
          className="border w-full p-2 mb-2 rounded"
          placeholder="+15555550100"
          value={phone}
          onChange={e=>setPhone(e.target.value)} 
        />
        <button 
          className="bg-slate-900 text-white px-3 py-2 rounded w-full" 
          onClick={sendCode}
          aria-label="Send verification code to phone"
        >
          Send Code
        </button>
      </section>

      {verificationId && (
        <section aria-label="Step 2: Verification Code" className="border-t pt-4">
          <label htmlFor="mfa-code" className="sr-only">Enter SMS code</label>
          <input 
            id="mfa-code"
            className="border w-full p-2 mb-2 rounded"
            placeholder="Enter SMS code"
            value={code}
            onChange={e=>setCode(e.target.value)} 
          />
          <button 
            className="bg-slate-900 text-white px-3 py-2 rounded w-full" 
            onClick={confirm}
            aria-label="Verify code and enable MFA"
          >
            Verify & Enable
          </button>
        </section>
      )}

      {msg && <p className="text-sm mt-3" role="alert">{msg}</p>}
    </article>
  );
}