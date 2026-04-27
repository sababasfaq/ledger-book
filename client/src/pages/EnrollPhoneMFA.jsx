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
      nav("/general-ledger", { replace: true });
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white border rounded">
      <h2 className="font-semibold mb-3">Enable SMS 2-Step</h2>
      <input className="border w-full p-2 mb-2"
             placeholder="+15555550100"
             value={phone}
             onChange={e=>setPhone(e.target.value)} />
      <button className="bg-slate-900 text-white px-3 py-2 rounded" onClick={sendCode}>
        Send Code
      </button>

      {verificationId && (
        <>
          <input className="border w-full p-2 mt-3 mb-2"
                 placeholder="Enter SMS code"
                 value={code}
                 onChange={e=>setCode(e.target.value)} />
          <button className="bg-slate-900 text-white px-3 py-2 rounded" onClick={confirm}>
            Verify & Enable
          </button>
        </>
      )}

      {msg && <p className="text-sm mt-3">{msg}</p>}
    </div>
  );
}
