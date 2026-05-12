"use client";

import { useAdminCheck } from "@/lib/useAdminCheck";
import { useEffect, useState, type ReactNode } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, deleteDoc, updateDoc, Timestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { User as FirebaseUser } from "firebase/auth";
import { useAuth } from "@/lib/AuthContext";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Title, Tooltip, Legend, ArcElement, Filler,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement, Filler);

// ── Types ────────────────────────────────────────────────────────────────────

interface Post {
  id: string; title?: string; content: string; username?: string;
  userEmail: string; userId: string; isPrivate: boolean; isDraft: boolean;
  createdAt: Timestamp; likes?: string[]; tags?: string[]; categories?: string[]; reported?: boolean;
}

interface User {
  id: string; email?: string; username?: string; role?: string;
  banned?: boolean; following?: string[]; createdAt?: Timestamp;
}

type ActiveView = "dashboard" | "users" | "posts" | "reports" | "settings";
type PostFilter = "all" | "public" | "private" | "draft";
type PostSort  = "newest" | "oldest" | "most-liked";
type Timeframe = "week" | "month";

// ── Helpers ──────────────────────────────────────────────────────────────────

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&[^;]+;/g, " ");

function filterAndSortPosts(posts: Post[], filter: PostFilter, sort: PostSort) {
  let out = [...posts];
  if (filter === "public")  out = out.filter((p) => !p.isPrivate && !p.isDraft);
  if (filter === "private") out = out.filter((p) => p.isPrivate);
  if (filter === "draft")   out = out.filter((p) => p.isDraft);
  if (sort === "newest")    out.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  if (sort === "oldest")    out.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
  if (sort === "most-liked") out.sort((a, b) => (b.likes?.length ?? 0) - (a.likes?.length ?? 0));
  return out;
}

/** Builds labels + zero-filled counts for the last N days, then populates from items. */
function buildTimeSeriesData(
  items: { date: Date }[],
  timeframe: Timeframe
): { labels: string[]; counts: number[] } {
  const now   = new Date();
  const days  = timeframe === "week" ? 7 : 30;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const data: Record<string, number> = {};

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const key = timeframe === "week" ? dayNames[d.getDay()] : `${d.getMonth() + 1}/${d.getDate()}`;
    data[key] = (data[key] ?? 0); // keep existing keys (week has duplicates, that's fine)
  }

  items.forEach(({ date }) => {
    const diff = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
    if (diff < days) {
      const key = timeframe === "week" ? dayNames[date.getDay()] : `${date.getMonth() + 1}/${date.getDate()}`;
      if (key in data) data[key]++;
    }
  });

  const labels = Object.keys(data);
  const counts = Object.values(data);
  return { labels, counts };
}

const CHART_OPTIONS = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { backgroundColor: "rgba(0,0,0,0.8)", padding: 12, titleFont: { size: 14 }, bodyFont: { size: 13 } },
  },
  scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
};

// ── Main Component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { isAdmin, checking } = useAdminCheck();
  const { user, signOut } = useAuth();
  const [allPosts, setAllPosts]         = useState<Post[]>([]);
  const [allUsers, setAllUsers]         = useState<User[]>([]);
  const [loading, setLoading]           = useState(true);
  const [activeView, setActiveView]     = useState<ActiveView>("dashboard");
  const [searchQuery, setSearchQuery]   = useState("");
  const [postFilter, setPostFilter]     = useState<PostFilter>("all");
  const [postSort, setPostSort]         = useState<PostSort>("newest");
  const [timeframe, setTimeframe]       = useState<Timeframe>("week");
  const [notifications, setNotifications] = useState<string[]>([]);
  const [reportCount, setReportCount]   = useState(0);
  const router = useRouter();

  useEffect(() => { if (isAdmin) loadAdminData(); }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const notes: string[] = [];
    const reported = allPosts.filter((p) => p.reported).length;
    if (reported > 0)        notes.push(`${reported} post${reported > 1 ? "s" : ""} reported`);
    if (reportCount > 0)     notes.push(`${reportCount} pending report${reportCount > 1 ? "s" : ""}`);
    if (allPosts.length > 10) notes.push("High Firestore usage detected");
    if (allPosts.length > 5)  notes.push("Cloudinary storage nearing limit");
    if (!notes.length && allPosts.length > 0) notes.push("System heartbeat: All services operational");
    setNotifications(notes);
  }, [allPosts, isAdmin, reportCount]);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [postsSnap, usersSnap, reportsSnap] = await Promise.all([
        getDocs(collection(db, "posts")),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "reports")),
      ]);
      setAllPosts(postsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Post)));
      setAllUsers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as User)));
      setReportCount(reportsSnap.size);
    } catch (e) { console.error("Error loading admin data:", e); }
    finally { setLoading(false); }
  };

  const confirmAction = (msg: string, fn: () => Promise<void>, success: string, fail: string) =>
    window.confirm(msg) && fn().then(() => { alert(success); loadAdminData(); }).catch(() => alert(fail));

  const deletePost    = (id: string, title: string) => confirmAction(
    `Delete post "${title || "Untitled"}"?\n\nThis action cannot be undone.`,
    () => deleteDoc(doc(db, "posts", id)),
    "Post deleted successfully!", "Failed to delete post."
  );

  const toggleBanUser = (id: string, banned: boolean, email: string) => confirmAction(
    `${banned ? "UNBAN" : "BAN"} user "${email}"?`,
    () => updateDoc(doc(db, "users", id), { banned: !banned }),
    `User ${banned ? "unban" : "ban"}ned successfully!`, `Failed to ${banned ? "unban" : "ban"} user.`
  );

  const makeAdmin   = (id: string, email: string) => confirmAction(
    `Make "${email}" an admin?`,
    () => updateDoc(doc(db, "users", id), { role: "admin" }),
    "User is now an admin!", "Failed to make user admin."
  );

  const removeAdmin = (id: string, email: string) => confirmAction(
    `Remove admin role from "${email}"?`,
    () => updateDoc(doc(db, "users", id), { role: "user" }),
    "Admin role removed!", "Failed to remove admin role."
  );

  const handleLogout = () => signOut().then(() => router.push("/")).catch(console.error);

  // ── Chart data ─────────────────────────────────────────────────────────────

  const postsChartData = (() => {
    const { labels, counts } = buildTimeSeriesData(
      allPosts.map((p) => ({ date: p.createdAt.toDate() })), timeframe
    );
    const max = Math.max(...counts, 0);
    return {
      labels,
      datasets: [{
        label: "Posts", data: counts,
        backgroundColor: counts.map((v) => (v === max && max > 0 ? "#F4A261" : "#6FA8DC")),
        borderColor:     counts.map((v) => (v === max && max > 0 ? "#F4A261" : "#6FA8DC")),
        borderWidth: 2,
      }],
    };
  })();

  const usersChartData = (() => {
    const { labels, counts } = buildTimeSeriesData(
      allUsers.filter((u) => u.createdAt).map((u) => ({ date: u.createdAt!.toDate() })), timeframe
    );
    const max = Math.max(...counts, 0);
    return {
      labels,
      datasets: [{
        label: "New Users", data: counts,
        backgroundColor: "rgba(47,75,124,0.15)", borderColor: "#2F4B7C", borderWidth: 2,
        tension: 0.4, fill: true,
        pointBackgroundColor: counts.map((v) => (v === max && max > 0 ? "#F4A261" : "#2F4B7C")),
        pointBorderColor:     counts.map((v) => (v === max && max > 0 ? "#F4A261" : "#2F4B7C")),
        pointRadius:          counts.map((v) => (v === max && max > 0 ? 6 : 3)),
      }],
    };
  })();

  // ── Derived data ───────────────────────────────────────────────────────────

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center bg-[#fbfbfe]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6FA8DC] mx-auto" />
        <p className="mt-4 text-[#22181C]">Checking admin access...</p>
      </div>
    </div>
  );
  if (!isAdmin) return null;

  const stats = {
    totalUsers:   allUsers.filter((u) => u.role !== "admin").length,
    totalPosts:   allPosts.length,
    bannedUsers:  allUsers.filter((u) => u.banned).length,
    admins:       allUsers.filter((u) => u.role === "admin").length,
    privatePosts: allPosts.filter((p) => p.isPrivate).length,
    draftPosts:   allPosts.filter((p) => p.isDraft).length,
  };

  const sortedPosts  = filterAndSortPosts(allPosts, postFilter, postSort);
  const recentPosts  = sortedPosts.slice(0, 10);
  const recentUsers  = allUsers.filter((u) => u.role !== "admin").slice(-10).reverse();
  const regularUsers = allUsers.filter((u) => u.role !== "admin");
  const adminUsers   = allUsers.filter((u) => u.role === "admin");

  // ── Shared sub-components (inline to avoid prop drilling) ──────────────────

  const PostFilterControls = () => (
    <div className="flex items-center gap-3">
      <Select value={postFilter} onChange={(v) => setPostFilter(v as PostFilter)}
        options={[["all","All Posts"],["public","Public Only"],["private","Private Only"],["draft","Drafts Only"]]} />
      <Select value={postSort} onChange={(v) => setPostSort(v as PostSort)}
        options={[["newest","Newest First"],["oldest","Oldest First"],["most-liked","Most Liked"]]} />
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-[#fbfbfe]">
      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-[#2F4B7C]">Nook Admin</h1>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1">
          {(["dashboard","users","posts","reports","settings"] as ActiveView[]).map((view) => (
            <NavItem key={view} icon={ICONS[view]()} label={view.charAt(0).toUpperCase() + view.slice(1)}
              active={activeView === view} onClick={() => setActiveView(view)}
              badge={view === "reports" && reportCount > 0
                ? <span className="w-2.5 h-2.5 bg-[#F4A261] rounded-full" /> : undefined} />
          ))}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg transition">
            {ICONS.logout()} <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* HEADER */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <div className="flex-1 max-w-md relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{ICONS.search()}</span>
            <input type="text" placeholder="Search users, posts..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6FA8DC] focus:border-transparent outline-none" />
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 hover:bg-gray-100 rounded-lg transition">
              {ICONS.bell()}
              {notifications.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />}
            </button>
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-[#6FA8DC] to-[#2F4B7C] flex items-center justify-center text-white font-bold">
                {user?.email?.[0].toUpperCase() ?? "A"}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Admin</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <main className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6FA8DC] mx-auto" />
                <p className="mt-4 text-gray-600">Loading...</p>
              </div>
            </div>
          ) : (
            <>
              {/* DASHBOARD */}
              {activeView === "dashboard" && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900">Dashboard Overview</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <StatsCard label="Total Users"   value={stats.totalUsers}   color="#6FA8DC" />
                    <StatsCard label="Total Posts"   value={stats.totalPosts}   color="#2F4B7C" />
                    <StatsCard label="Admins"        value={stats.admins}       color="#6FA8DC" />
                    <StatsCard label="Banned Users"  value={stats.bannedUsers}  color="#F4A261" />
                    <StatsCard label="Private Posts" value={stats.privatePosts} color="#2F4B7C" />
                    <StatsCard label="Draft Posts"   value={stats.draftPosts}   color="#F4A261" />
                  </div>

                  {/* Analytics */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-semibold text-gray-900">Analytics Overview</h3>
                      <Select value={timeframe} onChange={(v) => setTimeframe(v as Timeframe)}
                        options={[["week","Last 7 Days"],["month","Last 30 Days"]]} />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <ChartCard title="Posts Activity">
                        <Bar key={`posts-${timeframe}`} data={postsChartData} options={CHART_OPTIONS} />
                      </ChartCard>
                      <ChartCard title="New Users">
                        <Line key={`users-${timeframe}`} data={usersChartData} options={CHART_OPTIONS} />
                      </ChartCard>
                    </div>
                  </div>

                  {/* Recent Posts */}
                  <div className="bg-white rounded-lg border border-gray-200">
                    <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">Recent Posts</h3>
                      <PostFilterControls />
                    </div>
                    <PostsTable posts={recentPosts} onDelete={deletePost} />
                  </div>

                  {/* Recent Users (read-only) */}
                  <div className="bg-white rounded-lg border border-gray-200">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-900">Recent Users (Non-Admins)</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            {["Email","Username","Role","Status"].map((h) => (
                              <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {recentUsers.map((u) => (
                            <tr key={u.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 text-sm text-gray-900">{u.email ?? "No email"}</td>
                              <td className="px-6 py-4 text-sm text-gray-600">{u.username ?? "Not set"}</td>
                              <td className="px-6 py-4"><StatusBadge color="gray">User</StatusBadge></td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.banned ? "bg-red-100 text-red-600" : "bg-[#EBF3EC] text-[#7A9E7E]"}`}>
                                  {u.banned ? "Banned" : "Active"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* USERS */}
              {activeView === "users" && (
                <div className="space-y-8">
                  <Section title={`Regular Users (${regularUsers.length})`}>
                    <UsersTable users={regularUsers} onToggleBan={toggleBanUser} onMakeAdmin={makeAdmin} onRemoveAdmin={removeAdmin} />
                  </Section>
                  <Section title={`Admins (${adminUsers.length})`}>
                    <UsersTable users={adminUsers} onToggleBan={toggleBanUser} onMakeAdmin={makeAdmin} onRemoveAdmin={removeAdmin} />
                  </Section>
                </div>
              )}

              {/* POSTS */}
              {activeView === "posts" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-gray-900">All Posts ({sortedPosts.length})</h2>
                    <PostFilterControls />
                  </div>
                  <PostsTable posts={sortedPosts} onDelete={deletePost} />
                </div>
              )}

              {/* REPORTS */}
              {activeView === "reports" && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900">Reports</h2>
                  <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                    {ICONS.reports("w-16 h-16 text-gray-300 mx-auto mb-4")}
                    <p className="text-gray-500">No reports yet. Reports will appear here when users flag content.</p>
                  </div>
                </div>
              )}

              {/* SETTINGS */}
              {activeView === "settings" && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <p className="text-gray-500">Settings panel coming soon...</p>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {notifications.length > 0 && <SystemHealthToast notifications={notifications} />}
    </div>
  );
}

// ── Small reusable components ─────────────────────────────────────────────────

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#6FA8DC] focus:border-transparent outline-none">
      {options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
    </select>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-4">{title}</h4>
      <div className="h-64">{children}</div>
    </div>
  );
}

function NavItem({ icon, label, active, badge, onClick }: {
  icon: ReactNode; label: string; active: boolean; onClick: () => void; badge?: ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${active ? "bg-[#6FA8DC] text-white" : "text-gray-700 hover:bg-gray-100"}`}>
      <div className={active ? "text-white" : "text-gray-500"}>{icon}</div>
      <span className="font-medium flex-1 text-left">{label}</span>
      {badge && <div className="flex items-center justify-end">{badge}</div>}
    </button>
  );
}

function StatsCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="text-3xl font-bold mt-2" style={{ color }}>{value}</p>
    </div>
  );
}

function StatusBadge({ children, color }: {
  children: ReactNode; color: "blue"|"green"|"yellow"|"red"|"purple"|"gray";
}) {
  const colors = {
    blue: "bg-blue-100 text-blue-700", green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-700", red: "bg-red-100 text-red-700",
    purple: "bg-purple-100 text-purple-700", gray: "bg-gray-100 text-gray-700",
  };
  return <span className={`px-2 py-1 rounded text-xs font-medium ${colors[color]}`}>{children}</span>;
}

function UsersTable({ users, onToggleBan, onMakeAdmin, onRemoveAdmin }: {
  users: User[];
  onToggleBan:   (id: string, banned: boolean, email: string) => void;
  onMakeAdmin:   (id: string, email: string) => void;
  onRemoveAdmin: (id: string, email: string) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            {["Email","Username","Role","Status","Actions"].map((h) => (
              <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 text-sm text-gray-900">{u.email ?? "No email"}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{u.username ?? "Not set"}</td>
              <td className="px-6 py-4">
                <StatusBadge color={u.role === "admin" ? "blue" : "gray"}>
                  {u.role === "admin" ? "Admin" : "User"}
                </StatusBadge>
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.banned ? "bg-red-100 text-red-600" : "bg-[#EBF3EC] text-[#7A9E7E]"}`}>
                  {u.banned ? "Banned" : "Active"}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className="flex gap-4">
                  {u.role === "admin" ? (
                    <button onClick={() => onRemoveAdmin(u.id, u.email ?? "")}
                      className="text-gray-600 hover:text-gray-800 text-sm font-medium px-3 py-1.5 rounded hover:bg-gray-100 transition">
                      Remove Admin
                    </button>
                  ) : (
                    <button onClick={() => onMakeAdmin(u.id, u.email ?? "")}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium px-3 py-1.5 rounded hover:bg-blue-50 transition">
                      Make Admin
                    </button>
                  )}
                  <button onClick={() => onToggleBan(u.id, u.banned ?? false, u.email ?? "")}
                    className={`text-sm font-medium px-3 py-1.5 rounded transition ${u.banned
                      ? "text-green-600 hover:text-green-800 hover:bg-green-50"
                      : "text-red-600 hover:text-red-800 hover:bg-red-50"}`}>
                    {u.banned ? "Unban" : "Ban"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PostsTable({ posts, onDelete }: { posts: Post[]; onDelete: (id: string, title: string) => void }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            {["Post","Author","Date","Likes","Status","Action"].map((h) => (
              <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {posts.length === 0 ? (
            <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No posts found with the selected filters.</td></tr>
          ) : posts.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="px-6 py-4">
                <div className="font-medium text-gray-900">{p.title ?? "Untitled"}</div>
                <div className="text-sm text-gray-500 truncate max-w-xs">{stripHtml(p.content).substring(0, 50)}...</div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">{p.username ?? p.userEmail}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{p.createdAt.toDate().toLocaleDateString()}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{p.likes?.length ?? 0}</td>
              <td className="px-6 py-4">
                <div className="flex gap-1">
                  {p.isPrivate  && <StatusBadge color="purple">Private</StatusBadge>}
                  {p.isDraft    && <StatusBadge color="yellow">Draft</StatusBadge>}
                  {!p.isPrivate && !p.isDraft && <StatusBadge color="green">Published</StatusBadge>}
                </div>
              </td>
              <td className="px-6 py-4">
                <button onClick={() => onDelete(p.id, p.title ?? "Untitled")}
                  className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SystemHealthToast({ notifications }: { notifications: string[] }) {
  return (
    <div className="fixed top-6 right-6 z-50 max-w-sm">
      <div className="bg-[#F6F3EC] border border-[#6FA8DC] rounded-lg p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-[#6FA8DC] shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">System Health</h4>
            <ul className="space-y-1">
              {notifications.map((n, i) => (
                <li key={i} className="text-xs text-gray-700 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[#6FA8DC] rounded-full shrink-0" />{n}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Icon map ──────────────────────────────────────────────────────────────────

const ICONS: Record<string, (cls?: string) => ReactNode> = {
  dashboard: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  users: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  posts: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
    </svg>
  ),
  reports: (cls = "w-5 h-5") => (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  settings: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  logout: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
  search: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  bell: () => (
    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
};