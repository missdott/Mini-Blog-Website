"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

import Modal from "@/lib/Modal";
import { compressProfileImage, formatFileSize, uploadToCloudinary } from "@/lib/imageUtils";

// ─── Types & Helpers ──────────────────────────────────────────────────────────

type Gender = "male" | "female" | "other" | "prefer-not-to-say" | "";
type Tab = "profile" | "account" | "privacy" | "appearance";

const ip = { fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" } as const;
const sw2 = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };
const navLink = "text-[#2F4B7C] hover:text-[#6FA8DC] font-bold transition-colors uppercase tracking-widest text-[11px]";
const menuItem = "flex items-center px-5 py-3 text-sm font-bold text-[#2F4B7C] hover:bg-[#F6F3EC] transition-colors";
const inputCls = "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6FA8DC]";
const labelCls = "block text-sm font-bold text-[#1F2F46] mb-1 uppercase tracking-wider";
const saveBtnCls = "w-full bg-[#6FA8DC] text-white py-2.5 rounded-lg hover:bg-[#5A90C4] font-bold uppercase tracking-wider transition disabled:opacity-50";
const sectionTitle = "text-lg font-bold text-[#1F2F46] mb-6 uppercase tracking-wider";

const EyeIcon = ({ visible }: { visible: boolean }) => visible ? (
  <svg className="w-5 h-5" {...ip}><path {...sw2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
) : (
  <svg className="w-5 h-5" {...ip}><path {...sw2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path {...sw2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
);

const alert = (title: string, message: string, onConfirm?: () => void) =>
  ({ isOpen: true, type: (onConfirm ? "confirm" : "alert") as "alert" | "confirm", title, message, onConfirm });

// ─── SettingsPage ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [gender, setGender] = useState<Gender>("");
  const [profileImagePreview, setProfileImagePreview] = useState("");
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [defaultPrivacy, setDefaultPrivacy] = useState<"public" | "private">("public");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large">("medium");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [isSaving, setIsSaving] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [modalState, setModalState] = useState<{ isOpen: boolean; type: "confirm" | "alert"; title: string; message: string; onConfirm?: () => void }>({ isOpen: false, type: "alert", title: "", message: "" });

  // ── Effects ──

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { if (!loading && !user) router.push("/"); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.exists() ? snap.data() : {};
        setUsername(data.username || localStorage.getItem(`username_${user.uid}`) || "");
        setBio(data.bio || localStorage.getItem(`bio_${user.uid}`) || "");
        setGender((data.gender || localStorage.getItem(`gender_${user.uid}`) || "") as Gender);
        setProfileImagePreview(data.profileImage || localStorage.getItem(`profileImage_${user.uid}`) || "");
      } catch (err) { console.error("Error loading profile:", err); }
      setDefaultPrivacy((localStorage.getItem(`defaultPrivacy_${user.uid}`) as "public" | "private") || "public");
      setTheme((localStorage.getItem(`theme_${user.uid}`) as "light" | "dark" | "system") || "light");
      setFontSize((localStorage.getItem(`fontSize_${user.uid}`) as "small" | "medium" | "large") || "medium");
    })();
  }, [user]);

  // ── Handlers ──

  const handleProfileImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompressing(true); setCompressionInfo(null);
    const readPreview = (f: File) => { const r = new FileReader(); r.onloadend = () => setProfileImagePreview(r.result as string); r.readAsDataURL(f); };
    try {
      const originalSize = file.size;
      const compressed = await compressProfileImage(file);
      setProfileImageFile(compressed);
      setCompressionInfo(`${formatFileSize(originalSize)} → ${formatFileSize(compressed.size)}`);
      readPreview(compressed);
    } catch { setProfileImageFile(file); readPreview(file); }
    finally { setIsCompressing(false); }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      let imageUrl = profileImagePreview;
      if (profileImageFile) {
        imageUrl = await uploadToCloudinary(profileImageFile);
        setProfileImagePreview(imageUrl); setProfileImageFile(null);
      }
      await setDoc(doc(db, "users", user.uid), { username: username.trim(), bio: bio.trim(), gender, profileImage: imageUrl, email: user.email, userId: user.uid, updatedAt: new Date() }, { merge: true });
      localStorage.setItem(`username_${user.uid}`, username.trim());
      localStorage.setItem(`bio_${user.uid}`, bio.trim());
      localStorage.setItem(`gender_${user.uid}`, gender);
      localStorage.setItem(`profileImage_${user.uid}`, imageUrl);
      setModalState(alert("Profile Updated", "Your profile has been saved successfully!"));
    } catch { setModalState(alert("Error", "Failed to save profile. Please try again.")); }
    finally { setIsSaving(false); }
  };

  const handleChangePassword = async () => {
    if (!user?.email) return;
    if (newPassword !== confirmPassword) { setModalState(alert("Error", "New passwords do not match.")); return; }
    if (newPassword.length < 6) { setModalState(alert("Error", "Password must be at least 6 characters.")); return; }
    setIsSaving(true);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await updatePassword(user, newPassword);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setModalState(alert("Success", "Password changed successfully!"));
    } catch { setModalState(alert("Error", "Incorrect current password. Please try again.")); }
    finally { setIsSaving(false); }
  };

  const handleSavePrivacy = () => {
    if (!user) return;
    localStorage.setItem(`defaultPrivacy_${user.uid}`, defaultPrivacy);
    setModalState(alert("Saved", "Privacy settings updated!"));
  };

  const handleSaveAppearance = () => {
    if (!user) return;
    localStorage.setItem(`theme_${user.uid}`, theme);
    localStorage.setItem(`fontSize_${user.uid}`, fontSize);
    setModalState(alert("Saved", "Appearance settings updated!"));
  };

  const handleDeleteAccount = () => {
    setModalState(alert("Delete Account", "Are you sure you want to delete your account? This action cannot be undone and all your data will be lost.", async () => {
      try { await user?.delete(); router.push("/register"); }
      catch { setModalState(alert("Error", "Please log out and log back in before deleting your account.")); }
    }));
  };

  const handleLogout = async () => { await signOut(); router.push("/"); };
  const handleSearchNavigate = () => { if (searchQuery.trim()) router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`); };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "profile", label: "Profile", icon: <svg className="w-5 h-5" {...ip}><path {...sw2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
    { id: "account", label: "Account", icon: <svg className="w-5 h-5" {...ip}><path {...sw2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg> },
    { id: "privacy", label: "Privacy", icon: <svg className="w-5 h-5" {...ip}><path {...sw2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg> },
    { id: "appearance", label: "Appearance", icon: <svg className="w-5 h-5" {...ip}><path {...sw2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg> },
  ];

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F6F3EC]"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2F4B7C]" /></div>;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F6F3EC]">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40 border-b border-gray-100">
        <div className="w-full pl-4 pr-6 h-16 flex items-center justify-between gap-4">
          <Link href="/home"><h1 className="font-serif text-2xl font-bold tracking-wide text-[#2F4B7C] cursor-pointer transition-opacity hover:opacity-80">NOOK</h1></Link>
          <div className="flex-1 max-w-md">
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearchNavigate()} placeholder="Search posts..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6FA8DC] text-sm bg-white" />
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" {...ip}><path {...sw2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <button onClick={handleSearchNavigate} disabled={!searchQuery.trim()} className="px-4 py-2 text-sm font-bold text-white bg-[#6FA8DC] rounded-lg hover:bg-[#5A90C4] transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0">Search</button>
            </div>
          </div>
          <nav className="flex items-center gap-8 shrink-0">
            <Link href="/home" className={navLink}>Home</Link>
            <Link href="/dashboard" className={navLink}>My Blogs</Link>
            <Link href="/galleries" className={navLink}>Galleries</Link>
            <div className="relative" ref={menuRef}>
              <button onClick={() => setShowMenu((s) => !s)} className="p-2 hover:bg-[#F6F3EC] rounded-full transition-colors group">
                <svg className="w-6 h-6 text-[#2F4B7C] group-hover:scale-110 transition-transform" {...ip}><path {...sw2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-xl py-2 z-50 border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200" onClick={(e) => e.stopPropagation()}>
                  <div className="px-5 py-4 border-b border-gray-50">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Account</p>
                    <p className="text-sm font-bold text-[#1F2F46] truncate">{user.email}</p>
                  </div>
                  <div className="py-2">
                    <Link href="/dashboard" onClick={() => setShowMenu(false)} className={menuItem}>My Profile</Link>
                    <Link href="/bookmarks" onClick={() => setShowMenu(false)} className={menuItem}>Bookmarks</Link>
                    <Link href="/settings" onClick={() => setShowMenu(false)} className={menuItem}>Settings</Link>
                  </div>
                  <div className="border-t border-gray-50 pt-2 pb-1">
                    <button onClick={handleLogout} className="w-full text-left px-5 py-3 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors">Log Out</button>
                  </div>
                </div>
              )}
            </div>
          </nav>
        </div>
      </header>

      {/* Back button */}
      <div className="w-full pl-9 pt-8 pb-4">
        <button onClick={() => router.back()} className="inline-flex items-center text-[#2F4B7C] hover:text-[#6FA8DC] font-bold transition-colors uppercase tracking-widest text-sm">
          <svg className="w-4 h-4 mr-1" {...ip}><path {...sw2} d="M15 19l-7-7 7-7" /></svg>
          Go back
        </button>
      </div>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-md p-2">
              {tabs.map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-3 w-full px-4 py-3 rounded-lg text-sm font-bold transition-all uppercase tracking-wider ${activeTab === tab.id ? "bg-[#F6F3EC] text-[#2F4B7C]" : "text-gray-500 hover:bg-[#F6F3EC] hover:text-[#2F4B7C]"}`}>
                  <span className={activeTab === tab.id ? "text-[#2F4B7C]" : "text-gray-400"}>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">

            {/* Profile Tab */}
            {activeTab === "profile" && (
              <div className="bg-white rounded-xl shadow-md p-6">
                <h3 className={sectionTitle}>Profile Information</h3>
                <div className="flex items-center space-x-6 mb-6">
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-[#6FA8DC] relative">
                      {profileImagePreview
                        ? <Image src={profileImagePreview} alt="Profile" fill className="object-cover" unoptimized />
                        : <div className="w-full h-full bg-[#F6F3EC] flex items-center justify-center"><span className="text-3xl font-bold text-[#2F4B7C]">{(username || user.email || "U")[0].toUpperCase()}</span></div>
                      }
                    </div>
                    <button onClick={() => fileInputRef.current?.click()} className="absolute bottom-0 right-0 bg-[#6FA8DC] text-white p-1.5 rounded-full hover:bg-[#5A90C4] shadow-md transition">
                      <svg className="w-3.5 h-3.5" {...ip}><path {...sw2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path {...sw2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleProfileImageChange} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#1F2F46] uppercase tracking-wider">Profile Photo</p>
                    <p className="text-xs text-gray-500 mt-1">Click the camera icon to upload</p>
                    {isCompressing && <p className="text-xs text-[#6FA8DC] mt-1 font-medium">Compressing image...</p>}
                    {compressionInfo && !isCompressing && <p className="text-xs text-green-600 mt-1 font-medium">Compressed: {compressionInfo}</p>}
                    {profileImagePreview && <button onClick={() => { setProfileImagePreview(""); setProfileImageFile(null); }} className="text-xs text-red-500 hover:text-red-700 mt-1 font-bold uppercase tracking-wider">Remove photo</button>}
                  </div>
                </div>
                <div className="space-y-4">
                  <div><label className={labelCls}>Username</label><input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" className={inputCls} /></div>
                  <div>
                    <label className={labelCls}>Email</label>
                    <input type="email" value={user.email || ""} disabled className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed" />
                    <p className="text-xs text-gray-400 mt-1">Email cannot be changed</p>
                  </div>
                  <div>
                    <label className={labelCls}>Bio</label>
                    <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell others about yourself..." rows={3} maxLength={160} className={`${inputCls} resize-none`} />
                    <p className="text-xs text-gray-400 text-right">{bio.length}/160</p>
                  </div>
                  <div>
                    <label className={labelCls}>Gender</label>
                    <select value={gender} onChange={(e) => setGender(e.target.value as Gender)} className={inputCls}>
                      <option value="">Prefer not to say</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                      <option value="prefer-not-to-say">Prefer not to say</option>
                    </select>
                  </div>
                  <button onClick={handleSaveProfile} disabled={isSaving} className={saveBtnCls}>{isSaving ? "Saving..." : "Save Profile"}</button>
                </div>
              </div>
            )}

            {/* Account Tab */}
            {activeTab === "account" && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-md p-6">
                  <h3 className={sectionTitle}>Change Password</h3>
                  <div className="space-y-4">
                    {([
                      ["Current Password", currentPassword, setCurrentPassword, showCurrentPw, setShowCurrentPw, "Enter current password"],
                      ["New Password", newPassword, setNewPassword, showNewPw, setShowNewPw, "Enter new password"],
                    ] as const).map(([label, value, setter, show, setShow, placeholder]) => (
                      <div key={label}>
                        <label className={labelCls}>{label}</label>
                        <div className="relative">
                          <input type={show ? "text" : "password"} value={value} onChange={(e) => setter(e.target.value)} placeholder={placeholder} className={`${inputCls} pr-10`} />
                          <button onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" type="button">
                            <EyeIcon visible={show} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div>
                      <label className={labelCls}>Confirm New Password</label>
                      <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className={inputCls} />
                    </div>
                    <button onClick={handleChangePassword} disabled={isSaving || !currentPassword || !newPassword || !confirmPassword} className={saveBtnCls}>{isSaving ? "Updating..." : "Update Password"}</button>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-md p-6 border border-red-100">
                  <h3 className="text-lg font-bold text-red-600 mb-2 uppercase tracking-wider">Danger Zone</h3>
                  <p className="text-sm text-gray-600 mb-4">Once you delete your account, there is no going back. Please be certain.</p>
                  <button onClick={handleDeleteAccount} className="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold uppercase tracking-wider transition text-sm">Delete Account</button>
                </div>
              </div>
            )}

            {/* Privacy Tab */}
            {activeTab === "privacy" && (
              <div className="bg-white rounded-xl shadow-md p-6">
                <h3 className={sectionTitle}>Privacy Settings</h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-bold text-[#1F2F46] mb-3 uppercase tracking-wider">Default Post Visibility</h4>
                    <p className="text-xs text-gray-500 mb-3">Choose who can see your posts by default when you create them.</p>
                    <div className="space-y-3">
                      {([
                        ["public", <svg key="pub" className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>, "Everyone on Nook can see your posts"],
                        ["private", <svg key="prv" className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>, "Only you can see your posts"],
                      ] as const).map(([val, icon, desc]) => (
                        <label key={val} className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${defaultPrivacy === val ? "border-[#6FA8DC] bg-[#F6F3EC]" : "border-gray-200 hover:border-gray-300"}`}>
                          <input type="radio" checked={defaultPrivacy === val} onChange={() => setDefaultPrivacy(val)} className="mr-3 accent-[#6FA8DC]" />
                          <div className="flex items-center space-x-3">{icon}<div><p className="text-sm font-bold text-[#1F2F46] uppercase tracking-wider">{val}</p><p className="text-xs text-gray-500">{desc}</p></div></div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <button onClick={handleSavePrivacy} className={saveBtnCls}>Save Privacy Settings</button>
                </div>
              </div>
            )}

            {/* Appearance Tab */}
            {activeTab === "appearance" && (
              <div className="bg-white rounded-xl shadow-md p-6">
                <h3 className={sectionTitle}>Appearance</h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-bold text-[#1F2F46] mb-3 uppercase tracking-wider">Theme</h4>
                    <div className="grid grid-cols-3 gap-3">
                      {(["light", "dark", "system"] as const).map((t) => (
                        <button key={t} onClick={() => setTheme(t)} className={`p-4 rounded-lg border-2 text-center transition-all ${theme === t ? "border-[#6FA8DC] bg-[#F6F3EC]" : "border-gray-200 hover:border-gray-300"}`}>
                          <div className={`w-10 h-10 rounded-lg mx-auto mb-2 ${t === "light" ? "bg-white border border-gray-200" : t === "dark" ? "bg-gray-900" : "bg-linear-to-r from-white to-gray-900"}`} />
                          <p className="text-sm font-bold uppercase tracking-wider text-[#1F2F46]">{t}</p>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Note: Theme changes are saved for future updates.</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#1F2F46] mb-3 uppercase tracking-wider">Font Size</h4>
                    <div className="grid grid-cols-3 gap-3">
                      {(["small", "medium", "large"] as const).map((size) => (
                        <button key={size} onClick={() => setFontSize(size)} className={`p-4 rounded-lg border-2 text-center transition-all ${fontSize === size ? "border-[#6FA8DC] bg-[#F6F3EC]" : "border-gray-200 hover:border-gray-300"}`}>
                          <p className={`font-bold text-[#1F2F46] ${size === "small" ? "text-xs" : size === "medium" ? "text-sm" : "text-base"}`}>Aa</p>
                          <p className="text-xs text-gray-500 capitalize mt-1">{size}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={handleSaveAppearance} className={saveBtnCls}>Save Appearance</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Modal isOpen={modalState.isOpen} onClose={() => setModalState((m) => ({ ...m, isOpen: false }))} onConfirm={modalState.onConfirm} title={modalState.title} message={modalState.message} type={modalState.type} />
    </div>
  );
}