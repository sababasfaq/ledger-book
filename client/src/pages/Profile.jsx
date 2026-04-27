import { useEffect, useState } from "react";
import { useAuth } from "../state/AuthContext.jsx";
import AdminUsers from "./AdminUsers.jsx";

export default function Profile() {
  const { user, updateProfile, refreshMe } = useAuth();

  const [form, setForm] = useState({
    name: "",
    pictureUrl: "",
    info: "",
  });

  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || "",
        pictureUrl: user.pictureUrl || "",
        info: user.info || "",
      });
      setPreviewUrl(user.pictureUrl || "");
    }
  }, [user]);

  useEffect(() => {
    refreshMe().catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMsg("Please select a valid image file.");
      return;
    }

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      setMsg("Image size must be 2MB or less.");
      return;
    }

    setMsg("");
    setSelectedFile(file);

    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
  };

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const onSave = async (e) => {
    e.preventDefault();

    try {
      setUploading(true);
      setMsg("");

      let payload = {
        name: form.name,
        pictureUrl: form.pictureUrl,
        info: form.info,
      };

      if (selectedFile) {
        const base64 = await fileToBase64(selectedFile);
        payload.pictureUrl = base64;
      }

      await updateProfile(payload);

      setForm((prev) => ({
        ...prev,
        pictureUrl: payload.pictureUrl,
      }));

      setSelectedFile(null);
      setMsg("Profile updated successfully.");
      await refreshMe();
    } catch (e2) {
      setMsg(e2.message || "Failed to update profile.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold mb-4">Profile</h1>

        <form
          onSubmit={onSave}
          className="bg-white border rounded p-6 w-full space-y-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-full overflow-hidden border bg-slate-100 flex items-center justify-center">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-slate-400 text-sm">No Image</span>
              )}
            </div>

            <div className="text-sm text-slate-600">
              Upload a profile picture
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1">Full Name</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Your name"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Profile Picture</label>
            <input
              type="file"
              accept="image/*"
              className="border rounded px-3 py-2 w-full"
              onChange={handleFileChange}
            />
            <p className="text-xs text-slate-500 mt-1">
              Supported: image files only, up to 2MB
            </p>
          </div>

          <div>
            <label className="block text-sm mb-1">Basic Information</label>
            <textarea
              className="border rounded px-3 py-2 w-full min-h-32"
              value={form.info}
              onChange={(e) => setForm({ ...form, info: e.target.value })}
              placeholder="Write your department info, designation, phone, address, etc."
            />
          </div>

          {user?.email && (
            <div className="text-sm text-slate-600">Email: {user.email}</div>
          )}

          {msg && (
            <p
              className={`text-sm ${
                msg.toLowerCase().includes("success")
                  ? "text-emerald-700"
                  : "text-red-600"
              }`}
            >
              {msg}
            </p>
          )}

          <button
            type="submit"
            disabled={uploading}
            className="px-4 py-2 rounded bg-slate-900 text-white disabled:opacity-50"
          >
            {uploading ? "Saving..." : "Save Profile"}
          </button>
        </form>
      </div>

      {user?.role === "super_admin" && (
        <div className="bg-white border rounded p-6">
          <AdminUsers />
        </div>
      )}
    </div>
  );
}