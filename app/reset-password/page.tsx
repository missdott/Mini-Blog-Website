"use client";

import { useState, useEffect, Suspense } from "react";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ip = { fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" } as const;
const sw2 = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };
const inputCls = "w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#6FA8DC] focus:bg-white focus:border-transparent outline-none transition text-gray-900 placeholder-gray-400";
const btnPrimary = "block w-full bg-[#6FA8DC] text-white py-3.5 rounded-xl font-semibold hover:bg-[#5a8ec4] active:scale-[0.98] transition-all text-center shadow-lg shadow-[#6FA8DC]/20";

const EyeIcon = ({ visible }: { visible: boolean }) => visible ? (
  <svg className="w-5 h-5" {...ip}><path {...sw2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
) : (
  <svg className="w-5 h-5" {...ip}><path {...sw2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path {...sw2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
);

const Spinner = ({ label }: { label: string }) => (
  <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-[#F6F3EC] to-white">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6FA8DC] mx-auto" />
      <p className="mt-4 text-[#2F4B7C]">{label}</p>
    </div>
  </div>
);

const errorMessages: Record<string, string> = {
  "auth/invalid-action-code": "Invalid or expired reset link. Please request a new password reset.",
  "auth/expired-action-code": "This reset link has expired. Please request a new password reset.",
};

// ─── ResetPasswordContent ─────────────────────────────────────────────────────

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [validCode, setValidCode] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    if (!oobCode) { setError("Invalid reset link. Please request a new password reset."); setVerifying(false); return; }
    verifyPasswordResetCode(auth, oobCode)
      .then((email) => { setUserEmail(email); setValidCode(true); })
      .catch((err) => setError(errorMessages[(err as { code?: string }).code ?? ""] ?? "Invalid reset link. Please request a new password reset."))
      .finally(() => setVerifying(false));
  }, [oobCode]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (!oobCode) { setError("Invalid reset code"); return; }
    setLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setSuccess(true);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(errorMessages[code] ?? (code === "auth/weak-password" ? "Password is too weak. Please use a stronger password" : "Failed to reset password. Please try again"));
    } finally { setLoading(false); }
  };

  if (verifying) return <Spinner label="Verifying reset link..." />;

  const passwordsMatch = newPassword === confirmPassword;

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-[#F6F3EC] to-white px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <Image src="/logo.png" alt="Nook Logo" width={80} height={80} className="object-contain" priority />
          </div>
          <h1 className="text-3xl font-bold text-[#2F4B7C] mb-2">Reset Password 🔒</h1>
          <p className="text-gray-600 text-sm">{success ? "Password successfully reset!" : "Enter your new password below"}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {success ? (
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-600" {...ip}><path {...sw2} d="M5 13l4 4L19 7" /></svg>
                </div>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">✅ Password successfully reset!</h2>
                <p className="text-gray-600 text-sm">You can now log in with your new password.</p>
              </div>
              <Link href="/login" className={btnPrimary}>Go to Login</Link>
            </div>

          ) : !validCode ? (
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-600" {...ip}><path {...sw2} d="M6 18L18 6M6 6l12 12" /></svg>
                </div>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">❌ Invalid or Expired Link</h2>
                <p className="text-gray-600 text-sm mb-4">{error || "This password reset link is invalid or has expired."}</p>
              </div>
              <Link href="/forgot-password" className={btnPrimary}>Request New Reset Link</Link>
              <Link href="/login" className="block text-sm text-gray-600 hover:text-[#2F4B7C] transition">Back to Login</Link>
            </div>

          ) : (
            <form onSubmit={handleResetPassword} className="space-y-5">
              {userEmail && (
                <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-sm">
                  Resetting password for: <strong>{userEmail}</strong>
                </div>
              )}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
                  <svg className="w-5 h-5 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                  <span>{error}</span>
                </div>
              )}

              {/* Password fields */}
              {([
                ["newPassword", "New Password", newPassword, setNewPassword, showNew, setShowNew, "Enter new password"],
                ["confirmPassword", "Confirm Password", confirmPassword, setConfirmPassword, showConfirm, setShowConfirm, "Confirm new password"],
              ] as const).map(([id, label, value, setter, show, setShow, placeholder]) => (
                <div key={id}>
                  <label htmlFor={id} className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
                  <div className="relative">
                    <input type={show ? "text" : "password"} id={id} value={value} onChange={(e) => setter(e.target.value)} required minLength={6} className={inputCls} placeholder={placeholder} disabled={loading} />
                    <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1" tabIndex={-1}>
                      <EyeIcon visible={show} />
                    </button>
                  </div>
                  {id === "confirmPassword" && newPassword && confirmPassword && (
                    <p className={`mt-2 text-xs flex items-center gap-1 ${passwordsMatch ? "text-green-600" : "text-red-600"}`}>
                      {passwordsMatch ? (
                        <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>Passwords match</>
                      ) : (
                        <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>👉 Passwords must match</>
                      )}
                    </p>
                  )}
                </div>
              ))}

              <button type="submit" disabled={loading || !passwordsMatch || newPassword.length < 6} className="w-full bg-[#6FA8DC] text-white py-3.5 rounded-xl font-semibold hover:bg-[#5a8ec4] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#6FA8DC]/20">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                    Resetting Password...
                  </span>
                ) : "Reset Password"}
              </button>
            </form>
          )}
        </div>

        {!success && validCode && (
          <div className="text-center mt-6">
            <Link href="/login" className="text-sm text-gray-600 hover:text-[#2F4B7C] transition inline-flex items-center gap-1">
              <svg className="w-4 h-4" {...ip}><path {...sw2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              Back to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ResetPasswordPage ────────────────────────────────────────────────────────

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Spinner label="Loading..." />}>
      <ResetPasswordContent />
    </Suspense>
  );
}