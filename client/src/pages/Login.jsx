import { useEffect, useState } from "react";
import { useAuth } from "../state/AuthContext.jsx";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const { signup, login, complete2FA, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate("/general-ledger", { replace: true });
  }, [user, navigate]);

  const [mode, setMode] = useState("login"); // login | signup | verify
  const [username, setUsername] = useState(""); // email or name
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [twoFAEmail, setTwoFAEmail] = useState("");
  const [msg, setMsg] = useState("");

  const [signupForm, setSignupForm] = useState({
    name: "", email: "", password: "", pictureUrl: "", info: "",
  });

  return (
    <div className="max-w-lg mx-auto bg-white border rounded p-6">
      <div className="flex gap-2 mb-4">
        <button className={`px-3 py-1 rounded ${mode!=="signup"?"bg-slate-900 text-white":"bg-slate-100"}`} onClick={()=>setMode("login")}>Login</button>
        <button className={`px-3 py-1 rounded ${mode==="signup"?"bg-slate-900 text-white":"bg-slate-100"}`} onClick={()=>setMode("signup")}>Sign Up</button>
      </div>

      {mode==="login" && (
        <div className="space-y-3">
          <input className="w-full px-3 py-2 border rounded" placeholder="Email or Name" value={username} onChange={(e)=>setUsername(e.target.value)} />
          <input type="password" className="w-full px-3 py-2 border rounded" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} />
          <button className="px-3 py-2 rounded bg-slate-900 text-white" onClick={async ()=>{
            const res = await login(username, password);
            if (res.ok && res.twoFactor) {
              setTwoFAEmail(res.email);
              setMsg(res.message || "Enter the verification code sent to your email.");
              setMode("verify");
            } else if (res.ok) {
              navigate("/general-ledger", { replace: true });
            } else {
              setMsg(res.message || (res.pendingApproval ? "Approval pending" : "Login failed"));
            }
          }}>Login</button>
          {msg && <p className="text-sm text-slate-600">{msg}</p>}
        </div>
      )}

      {mode==="verify" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">{msg || `Enter the code sent to ${twoFAEmail}`}</p>
          <input className="w-full px-3 py-2 border rounded" placeholder="Email" value={twoFAEmail} onChange={(e)=>setTwoFAEmail(e.target.value)} />
          <input className="w-full px-3 py-2 border rounded" placeholder="Enter Code" value={otp} onChange={(e)=>setOtp(e.target.value)} />
          <button className="px-3 py-2 rounded bg-slate-900 text-white" onClick={async ()=>{
            try {
              const ok = await complete2FA(twoFAEmail, otp);
              if (ok?.ok) navigate("/general-ledger", { replace: true });
            } catch (e) { setMsg(e.message); }
          }}>Verify & Login</button>
          <button className="px-3 py-2 rounded bg-slate-100" onClick={()=>setMode("login")}>Back</button>
        </div>
      )}

      {mode==="signup" && (
        <form className="space-y-3" onSubmit={async (e)=>{
          e.preventDefault();
          try {
            const out = await signup(signupForm);
            setMsg(out.message);
            setMode("login");
            setUsername(signupForm.email);
          } catch (err) { setMsg(err.message); }
        }}>
          <input className="w-full px-3 py-2 border rounded" placeholder="Full Name" value={signupForm.name} onChange={(e)=>setSignupForm({...signupForm,name:e.target.value})} />
          <input className="w-full px-3 py-2 border rounded" placeholder="Email" value={signupForm.email} onChange={(e)=>setSignupForm({...signupForm,email:e.target.value})} />
          <input type="password" className="w-full px-3 py-2 border rounded" placeholder="Password" value={signupForm.password} onChange={(e)=>setSignupForm({...signupForm,password:e.target.value})} />
          <input className="w-full px-3 py-2 border rounded" placeholder="Picture URL (optional)" value={signupForm.pictureUrl} onChange={(e)=>setSignupForm({...signupForm,pictureUrl:e.target.value})} />
          <textarea className="w-full px-3 py-2 border rounded" placeholder="Other personal information" value={signupForm.info} onChange={(e)=>setSignupForm({...signupForm,info:e.target.value})} />
          <button className="px-3 py-2 rounded bg-slate-900 text-white">Create Account (Needs Approval)</button>
          {msg && <p className="text-sm text-slate-600">{msg}</p>}
        </form>
      )}
    </div>
  );
}
