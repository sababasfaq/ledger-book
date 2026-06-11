import { useEffect, useState } from "react";
import { useAuth } from "../state/AuthContext.jsx";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const { signup, login, complete2FA, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
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
    <article className="max-w-lg mx-auto bg-white border rounded p-6" aria-labelledby="auth-title">
      <header className="mb-4">
        <h1 id="auth-title" className="sr-only">{mode === 'signup' ? 'Create Account' : 'Account Login'}</h1>
        <div className="flex gap-2" role="tablist">
          <button 
            role="tab"
            aria-selected={mode !== "signup"}
            className={`px-3 py-1 rounded ${mode!=="signup"?"bg-slate-900 text-white":"bg-slate-100"}`} 
            onClick={()=>setMode("login")}
          >
            Login
          </button>
          <button 
            role="tab"
            aria-selected={mode === "signup"}
            className={`px-3 py-1 rounded ${mode==="signup"?"bg-slate-900 text-white":"bg-slate-100"}`} 
            onClick={()=>setMode("signup")}
          >
            Sign Up
          </button>
        </div>
      </header>

      {mode==="login" && (
        <section aria-labelledby="login-header" className="space-y-3">
          <h2 id="login-header" className="sr-only">Login Form</h2>
          <label htmlFor="login-username" className="sr-only">Email or Name</label>
          <input 
            id="login-username"
            className="w-full px-3 py-2 border rounded" 
            placeholder="Email or Name" 
            value={username} 
            onChange={(e)=>setUsername(e.target.value)} 
          />
          <label htmlFor="login-password" className="sr-only">Password</label>
          <input 
            id="login-password"
            type="password" 
            className="w-full px-3 py-2 border rounded" 
            placeholder="Password" 
            value={password} 
            onChange={(e)=>setPassword(e.target.value)} 
          />
          <button 
            className="px-3 py-2 rounded bg-slate-900 text-white w-full" 
            aria-label="Submit login"
            onClick={async ()=>{
              const res = await login(username, password);
              if (res.ok && res.twoFactor) {
                setTwoFAEmail(res.email);
                setMsg(res.message || "Enter the verification code sent to your email.");
                setMode("verify");
              } else if (res.ok) {
                navigate("/dashboard", { replace: true });
              } else {
                setMsg(res.message || (res.pendingApproval ? "Approval pending" : "Login failed"));
              }
            }}
          >
            Login
          </button>
          {msg && <p className="text-sm text-slate-600" role="alert">{msg}</p>}
        </section>
      )}

      {mode==="verify" && (
        <section aria-labelledby="verify-header" className="space-y-3">
          <h2 id="verify-header" className="sr-only">Verification Form</h2>
          <p className="text-sm text-slate-600">{msg || `Enter the code sent to ${twoFAEmail}`}</p>
          <label htmlFor="verify-email" className="sr-only">Email</label>
          <input 
            id="verify-email"
            className="w-full px-3 py-2 border rounded" 
            placeholder="Email" 
            value={twoFAEmail} 
            onChange={(e)=>setTwoFAEmail(e.target.value)} 
          />
          <label htmlFor="verify-code" className="sr-only">Enter Code</label>
          <input 
            id="verify-code"
            className="w-full px-3 py-2 border rounded" 
            placeholder="Enter Code" 
            value={otp} 
            onChange={(e)=>setOtp(e.target.value)} 
          />
          <button 
            className="px-3 py-2 rounded bg-slate-900 text-white w-full" 
            aria-label="Submit verification code"
            onClick={async ()=>{
              try {
                const ok = await complete2FA(twoFAEmail, otp);
                if (ok?.ok) navigate("/dashboard", { replace: true });
              } catch (e) { setMsg(e.message); }
            }}
          >
            Verify & Login
          </button>
          <button 
            className="px-3 py-2 rounded bg-slate-100 w-full" 
            onClick={()=>setMode("login")}
            aria-label="Back to login"
          >
            Back
          </button>
        </section>
      )}

      {mode==="signup" && (
        <section aria-labelledby="signup-header">
          <h2 id="signup-header" className="sr-only">Signup Form</h2>
          <form className="space-y-3" onSubmit={async (e)=>{
            e.preventDefault();
            try {
              const out = await signup(signupForm);
              setMsg(out.message);
              setMode("login");
              setUsername(signupForm.email);
            } catch (err) { setMsg(err.message); }
          }}>
            <label htmlFor="signup-name" className="sr-only">Full Name</label>
            <input 
              id="signup-name"
              className="w-full px-3 py-2 border rounded" 
              placeholder="Full Name" 
              value={signupForm.name} 
              onChange={(e)=>setSignupForm({...signupForm,name:e.target.value})} 
              required
            />
            <label htmlFor="signup-email" className="sr-only">Email</label>
            <input 
              id="signup-email"
              type="email"
              className="w-full px-3 py-2 border rounded" 
              placeholder="Email" 
              value={signupForm.email} 
              onChange={(e)=>setSignupForm({...signupForm,email:e.target.value})} 
              required
            />
            <label htmlFor="signup-password" className="sr-only">Password</label>
            <input 
              id="signup-password"
              type="password" 
              className="w-full px-3 py-2 border rounded" 
              placeholder="Password" 
              value={signupForm.password} 
              onChange={(e)=>setSignupForm({...signupForm,password:e.target.value})} 
              required
            />
            <label htmlFor="signup-pic" className="sr-only">Picture URL (optional)</label>
            <input 
              id="signup-pic"
              className="w-full px-3 py-2 border rounded" 
              placeholder="Picture URL (optional)" 
              value={signupForm.pictureUrl} 
              onChange={(e)=>setSignupForm({...signupForm,pictureUrl:e.target.value})} 
            />
            <label htmlFor="signup-info" className="sr-only">Other personal information</label>
            <textarea 
              id="signup-info"
              className="w-full px-3 py-2 border rounded" 
              placeholder="Other personal information" 
              value={signupForm.info} 
              onChange={(e)=>setSignupForm({...signupForm,info:e.target.value})} 
            />
            <button 
              className="px-3 py-2 rounded bg-slate-900 text-white w-full"
              aria-label="Create account"
            >
              Create Account (Needs Approval)
            </button>
            {msg && <p className="text-sm text-slate-600" role="alert">{msg}</p>}
          </form>
        </section>
      )}
    </article>
  );
}