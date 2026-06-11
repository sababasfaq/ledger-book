import { useEffect, useState, useRef } from "react";
import { useAuth } from "../state/AuthContext.jsx";
import AdminUsers from "./AdminUsers.jsx";
import { api } from "../api";
import { 
  Camera, 
  Eye, 
  EyeOff, 
  Save, 
  Key, 
  Info, 
  User, 
  Mail, 
  Shield, 
  Calendar, 
  Phone, 
  MapPin, 
  Briefcase, 
  Building,
  CheckCircle,
  AlertCircle,
  Loader2
} from "lucide-react";

export default function Profile() {
  const { user, updateProfile, refreshMe } = useAuth();
  const [activeTab, setActiveTab] = useState("edit");
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const fileInputRef = useRef(null);

  // Edit Profile Form
  const [profileForm, setEditForm] = useState({
    name: "",
    designation: "",
    department: "",
    phone: "",
    info: "",
    pictureUrl: "",
  });
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");

  // Change Password Form
  const [passForm, setPassForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passLoading, setPassLoading] = useState(false);
  const [passMsg, setPassMsg] = useState({ message: "", type: "" });
  const [showPass, setShowPass] = useState({ current: false, new: false, confirm: false });

  useEffect(() => {
    if (user) {
      setEditForm({
        name: user.name || "",
        designation: user.designation || "",
        department: user.department || "",
        phone: user.phone || "",
        info: user.info || "",
        pictureUrl: user.pictureUrl || "",
      });
      setPreviewUrl(user.pictureUrl || "");
    }
  }, [user]);

  useEffect(() => {
    refreshMe().catch(() => {});
  }, []);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Please select a valid image file.", "error");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast("Image size must be 2MB or less.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result;
      setPreviewUrl(base64);
      setEditForm(prev => ({ ...prev, pictureUrl: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const onSaveProfile = async (e) => {
    e.preventDefault();
    if (!profileForm.name.trim()) {
      showToast("Full Name is required.", "error");
      return;
    }

    try {
      setUploading(true);
      await updateProfile(profileForm);
      showToast("Profile updated successfully!");
      await refreshMe();
    } catch (err) {
      showToast(err.message || "Failed to update profile.", "error");
    } finally {
      setUploading(false);
    }
  };

  const onChangePassword = async (e) => {
    e.preventDefault();
    setPassMsg({ message: "", type: "" });

    if (passForm.newPassword.length < 6) {
      setPassMsg({ message: "New password must be at least 6 characters.", type: "error" });
      return;
    }
    if (passForm.newPassword !== passForm.confirmPassword) {
      setPassMsg({ message: "Passwords do not match.", type: "error" });
      return;
    }

    try {
      setPassLoading(true);
      await api.changePassword({
        currentPassword: passForm.currentPassword,
        newPassword: passForm.newPassword,
      });
      setPassMsg({ message: "Password changed successfully!", type: "success" });
      setPassForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setPassMsg({ message: err.message || "Failed to change password.", type: "error" });
    } finally {
      setPassLoading(false);
    }
  };

  if (!user) return <div className="p-8 text-center" role="status">Loading profile...</div>;

  return (
    <article className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500" aria-labelledby="profile-title">
      <header className="sr-only">
        <h1 id="profile-title">User Profile</h1>
      </header>

      {/* Toast Notification */}
      {toast.show && (
        <div role="status" aria-live="polite" className={`fixed top-20 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border animate-in slide-in-from-right duration-300 ${
          toast.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
        }`}>
          {toast.type === "success" ? <CheckCircle size={18} aria-hidden="true" /> : <AlertCircle size={18} aria-hidden="true" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8 items-stretch">
        {/* Left Column: Summary (Read Only) */}
        <section aria-label="Profile summary" className="w-full lg:w-1/3 flex">
          <div className="bg-white rounded-2xl border shadow-sm p-8 text-center space-y-4 w-full flex flex-col">
            <div className="relative inline-block mx-auto group">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-slate-50 shadow-inner bg-slate-100 flex items-center justify-center">
                {previewUrl ? (
                  <img src={previewUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User size={48} className="text-slate-300" aria-hidden="true" />
                )}
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                aria-label="Change profile picture"
              >
                <Camera size={24} aria-hidden="true" />
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" aria-hidden="true" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">{user.name}</h2>
              <div className="flex items-center justify-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                  user.role === "super_admin" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                }`}>
                  {user.role === "super_admin" ? "Chairman" : "Official"}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-slate-100 text-slate-600">
                  Approved
                </span>
              </div>
            </div>

            <div className="pt-4 border-t space-y-4 text-left flex-1">
              <div className="space-y-4" role="list">
                <ProfileInfoItem icon={<Mail size={16} />} label="Email" value={user.email} />
                {user.designation && <ProfileInfoItem icon={<Briefcase size={16} />} label="Designation" value={user.designation} />}
                {user.department && <ProfileInfoItem icon={<Building size={16} />} label="Department" value={user.department} />}
                <ProfileInfoItem icon={<Calendar size={16} />} label="Joined" value={new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} />
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Tabs */}
        <section aria-label="Account settings" className="w-full lg:w-2/3 flex">
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col w-full min-h-[500px]">
            {/* Tab Navigation */}
            <nav aria-label="Profile tabs">
              <ul role="tablist" className="flex border-b bg-slate-50/50 list-none p-0 m-0">
                <li className="flex-1">
                  <button 
                    role="tab"
                    aria-selected={activeTab === "edit"}
                    aria-controls="edit-panel"
                    id="edit-tab"
                    onClick={() => setActiveTab("edit")}
                    className={`w-full flex items-center justify-center gap-2 py-4 text-sm font-semibold transition border-b-2 ${
                      activeTab === "edit" ? "border-slate-900 text-slate-900 bg-white" : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <User size={16} aria-hidden="true" /> Edit Profile
                  </button>
                </li>
                <li className="flex-1">
                  <button 
                    role="tab"
                    aria-selected={activeTab === "password"}
                    aria-controls="password-panel"
                    id="password-tab"
                    onClick={() => setActiveTab("password")}
                    className={`w-full flex items-center justify-center gap-2 py-4 text-sm font-semibold transition border-b-2 ${
                      activeTab === "password" ? "border-slate-900 text-slate-900 bg-white" : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Key size={16} aria-hidden="true" /> Change Password
                  </button>
                </li>
                <li className="flex-1">
                  <button 
                    role="tab"
                    aria-selected={activeTab === "info"}
                    aria-controls="info-panel"
                    id="info-tab"
                    onClick={() => setActiveTab("info")}
                    className={`w-full flex items-center justify-center gap-2 py-4 text-sm font-semibold transition border-b-2 ${
                      activeTab === "info" ? "border-slate-900 text-slate-900 bg-white" : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Info size={16} aria-hidden="true" /> Account Info
                  </button>
                </li>
              </ul>
            </nav>

            <div className="p-8 flex-1">
              {/* Tab 1: Edit Profile */}
              {activeTab === "edit" && (
                <div role="tabpanel" id="edit-panel" aria-labelledby="edit-tab">
                  <form onSubmit={onSaveProfile} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label htmlFor="full-name" className="text-sm font-semibold text-slate-700">Full Name</label>
                        <input 
                          id="full-name"
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-slate-100 outline-none transition" 
                          placeholder="e.g. John Doe"
                          value={profileForm.name}
                          onChange={e => setEditForm({ ...profileForm, name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="designation" className="text-sm font-semibold text-slate-700">Designation</label>
                        <input 
                          id="designation"
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-slate-100 outline-none transition" 
                          placeholder="e.g. Assistant Professor"
                          value={profileForm.designation}
                          onChange={e => setEditForm({ ...profileForm, designation: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="department" className="text-sm font-semibold text-slate-700">Department</label>
                        <input 
                          id="department"
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-slate-100 outline-none transition" 
                          placeholder="e.g. CSE"
                          value={profileForm.department}
                          onChange={e => setEditForm({ ...profileForm, department: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="phone" className="text-sm font-semibold text-slate-700">Phone Number</label>
                        <div className="relative">
                          <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                          <input 
                            id="phone"
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-slate-100 outline-none transition" 
                            placeholder="01XXX-XXXXXX"
                            value={profileForm.phone}
                            onChange={e => setEditForm({ ...profileForm, phone: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="address-note" className="text-sm font-semibold text-slate-700">Address / Note</label>
                      <textarea 
                        id="address-note"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-slate-100 outline-none transition min-h-[120px]" 
                        placeholder="Enter additional details..."
                        value={profileForm.info}
                        onChange={e => setEditForm({ ...profileForm, info: e.target.value })}
                      />
                    </div>

                    <div className="pt-4">
                      <button 
                        type="submit"
                        disabled={uploading}
                        className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition shadow-lg shadow-slate-200 disabled:opacity-50"
                        aria-label="Save profile changes"
                      >
                        {uploading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
                        Save Profile Changes
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Tab 2: Change Password */}
              {activeTab === "password" && (
                <div role="tabpanel" id="password-panel" aria-labelledby="password-tab">
                  <form onSubmit={onChangePassword} className="max-w-md space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label htmlFor="curr-pass" className="text-sm font-semibold text-slate-700">Current Password</label>
                        <div className="relative">
                          <input 
                            id="curr-pass"
                            type={showPass.current ? "text" : "password"}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-slate-100 outline-none transition" 
                            value={passForm.currentPassword}
                            onChange={e => setPassForm({ ...passForm, currentPassword: e.target.value })}
                            required
                          />
                          <button 
                            type="button" 
                            onClick={() => setShowPass({ ...showPass, current: !showPass.current })}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            aria-label={showPass.current ? "Hide current password" : "Show current password"}
                          >
                            {showPass.current ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="new-pass" className="text-sm font-semibold text-slate-700">New Password</label>
                        <div className="relative">
                          <input 
                            id="new-pass"
                            type={showPass.new ? "text" : "password"}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-slate-100 outline-none transition" 
                            value={passForm.newPassword}
                            onChange={e => setPassForm({ ...passForm, newPassword: e.target.value })}
                            required
                            aria-describedby="new-pass-hint"
                          />
                          <button 
                            type="button" 
                            onClick={() => setShowPass({ ...showPass, new: !showPass.new })}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            aria-label={showPass.new ? "Hide new password" : "Show new password"}
                          >
                            {showPass.new ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                          </button>
                        </div>
                        <p id="new-pass-hint" className="text-[10px] text-slate-400">Minimum 6 characters</p>
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="confirm-pass" className="text-sm font-semibold text-slate-700">Confirm New Password</label>
                        <div className="relative">
                          <input 
                            id="confirm-pass"
                            type={showPass.confirm ? "text" : "password"}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-slate-100 outline-none transition" 
                            value={passForm.confirmPassword}
                            onChange={e => setPassForm({ ...passForm, confirmPassword: e.target.value })}
                            required
                          />
                          <button 
                            type="button" 
                            onClick={() => setShowPass({ ...showPass, confirm: !showPass.confirm })}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            aria-label={showPass.confirm ? "Hide confirm password" : "Show confirm password"}
                          >
                            {showPass.confirm ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {passMsg.message && (
                      <div className={`p-4 rounded-xl text-sm font-medium ${passMsg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`} role="alert">
                        {passMsg.message}
                      </div>
                    )}

                    <button 
                      type="submit"
                      disabled={passLoading}
                      className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition shadow-lg shadow-slate-200 disabled:opacity-50"
                      aria-label="Update password"
                    >
                      {passLoading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Key size={18} aria-hidden="true" />}
                      Update Password
                    </button>
                  </form>
                </div>
              )}

              {/* Tab 3: Account Info (Read Only) */}
              {activeTab === "info" && (
                <div role="tabpanel" id="info-panel" aria-labelledby="info-tab">
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <InfoField label="User ID" value={`#${user.id.toString().padStart(4, '0')}`} icon={<Shield size={18} />} />
                      <InfoField label="Email Address" value={user.email} icon={<Mail size={18} />} />
                      <InfoField label="Account Type" value={user.role === 'super_admin' ? 'Chairman' : 'Official'} icon={<User size={18} />} isBadge role={user.role} />
                      <InfoField label="Status" value="Verified & Approved" icon={<CheckCircle size={18} />} isBadge role="approved" />
                      <InfoField label="Member Since" value={new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} icon={<Calendar size={18} />} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Super Admin Section */}
      {user.role === "super_admin" && (
        <section aria-labelledby="user-mgmt-title" className="pt-8 border-t space-y-6">
          <div className="flex items-center gap-4">
            <h2 id="user-mgmt-title" className="text-2xl font-bold text-slate-900">User Management</h2>
            <div className="h-px flex-1 bg-slate-100" aria-hidden="true"></div>
          </div>
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <AdminUsers />
          </div>
        </section>
      )}
    </article>
  );
}

function InfoField({ label, value, icon, isBadge, role }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
      </div>
      {isBadge ? (
        <div className="flex">
          <span className={`px-3 py-1 rounded-lg text-sm font-bold ${
            role === 'super_admin' ? 'bg-emerald-100 text-emerald-700' : 
            role === 'official' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
          }`}>
            {value}
          </span>
        </div>
      ) : (
        <p className="text-lg font-semibold text-slate-800">{value}</p>
      )}
    </div>
  );
}

function ProfileInfoItem({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3 group" role="listitem">
      <div className="mt-0.5 p-1.5 rounded-lg bg-slate-50 text-slate-400 group-hover:text-slate-900 group-hover:bg-slate-100 transition duration-200" aria-hidden="true">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</div>
        <div className="text-sm font-medium text-slate-600 truncate">{value}</div>
      </div>
    </div>
  );
}