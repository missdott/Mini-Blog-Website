"use client";

import { useAdminCheck } from "@/lib/useAdminCheck";
import { useEffect, useState, type ReactNode } from "react";
import { db, auth } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { User as FirebaseUser } from "firebase/auth";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

interface Post {
  id: string;
  title?: string;
  content: string;
  username?: string;
  userEmail: string;
  userId: string;
  isPrivate: boolean;
  isDraft: boolean;
  createdAt: Timestamp;
  likes?: string[];
  tags?: string[];
  categories?: string[];
  reported?: boolean; // Add reported field
}

interface User {
  id: string;
  email?: string;
  username?: string;
  role?: string;
  banned?: boolean;
  following?: string[];
  createdAt?: Timestamp;
}

type ActiveView = "dashboard" | "users" | "posts" | "reports" | "settings";
type PostFilter = "all" | "public" | "private" | "draft";
type PostSort = "newest" | "oldest" | "most-liked";
type AnalyticsTimeframe = "week" | "month";

export default function AdminDashboard() {
  const { isAdmin, checking } = useAdminCheck();
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [postFilter, setPostFilter] = useState<PostFilter>("all");
  const [postSort, setPostSort] = useState<PostSort>("newest");
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<AnalyticsTimeframe>("week");
  const [systemNotifications, setSystemNotifications] = useState<string[]>([]);
  const [pendingReportCount, setPendingReportCount] = useState(0);
  const router = useRouter();

  // Listen to auth state
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadAdminData();
      checkSystemHealth();
    }
  }, [isAdmin]);



  useEffect(() => {
    if (isAdmin) {
      checkSystemHealth();
    }
  }, [allPosts, isAdmin, pendingReportCount]);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const postsSnap = await getDocs(collection(db, "posts"));
      const posts = postsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
      setAllPosts(posts);

      const usersSnap = await getDocs(collection(db, "users"));
      const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as User));
      setAllUsers(users);

      const reportsSnap = await getDocs(collection(db, "reports"));
      setPendingReportCount(reportsSnap.size);

      // Check system health after loading data
      checkSystemHealth();
    } catch (error) {
      console.error("Error loading admin data:", error);
    } finally {
      setLoading(false);
    }
  };

  const checkSystemHealth = () => {
    const notifications: string[] = [];

    // Check for reported posts
    const reportedPosts = allPosts.filter(post => post.reported);
    if (reportedPosts.length > 0) {
      notifications.push(`${reportedPosts.length} post${reportedPosts.length > 1 ? 's' : ''} reported`);
    }

    // Pending report documents from Firestore
    if (pendingReportCount > 0) {
      notifications.push(`${pendingReportCount} pending report${pendingReportCount > 1 ? 's' : ''}`);
    }

    // Simulate Firestore usage threshold (e.g., if more than 10 posts, high usage)
    if (allPosts.length > 10) {
      notifications.push("High Firestore usage detected");
    }

    // Simulate Cloudinary usage (since using Cloudinary now)
    // For demo, if there are images in posts or something, but since content is text, simulate based on post count
    if (allPosts.length > 5) {
      notifications.push("Cloudinary storage nearing limit");
    }

    // For testing, always show at least one notification
    if (notifications.length === 0 && allPosts.length > 0) {
      notifications.push("System heartbeat: All services operational");
    }

    setSystemNotifications(notifications);
  };

  const deletePost = async (postId: string, postTitle: string) => {
    if (!window.confirm(`Delete post "${postTitle || "Untitled"}"?\n\nThis action cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, "posts", postId));
      alert("Post deleted successfully!");
      loadAdminData();
    } catch (error) {
      console.error("Error deleting post:", error);
      alert("Failed to delete post.");
    }
  };

  const toggleBanUser = async (userId: string, currentBanStatus: boolean, userEmail: string) => {
    const action = currentBanStatus ? "unban" : "ban";
    if (!window.confirm(`${action.toUpperCase()} user "${userEmail}"?`)) return;
    try {
      await updateDoc(doc(db, "users", userId), { banned: !currentBanStatus });
      alert(`User ${action}ned successfully!`);
      loadAdminData();
    } catch (error) {
      console.error(`Error ${action}ning user:`, error);
      alert(`Failed to ${action} user.`);
    }
  };

  const makeAdmin = async (userId: string, userEmail: string) => {
    if (!window.confirm(`Make "${userEmail}" an admin?`)) return;
    try {
      await updateDoc(doc(db, "users", userId), { role: "admin" });
      alert("User is now an admin!");
      loadAdminData();
    } catch (error) {
      console.error("Error making user admin:", error);
      alert("Failed to make user admin.");
    }
  };

  const removeAdmin = async (userId: string, userEmail: string) => {
    if (!window.confirm(`Remove admin role from "${userEmail}"?`)) return;
    try {
      await updateDoc(doc(db, "users", userId), { role: "user" });
      alert("Admin role removed!");
      loadAdminData();
    } catch (error) {
      console.error("Error removing admin role:", error);
      alert("Failed to remove admin role.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // Filter and sort posts
  const getFilteredAndSortedPosts = (posts: Post[], filter: PostFilter, sort: PostSort) => {
    let filtered = [...posts];
    if (filter === "public") {
      filtered = filtered.filter((p) => !p.isPrivate && !p.isDraft);
    } else if (filter === "private") {
      filtered = filtered.filter((p) => p.isPrivate);
    } else if (filter === "draft") {
      filtered = filtered.filter((p) => p.isDraft);
    }

    if (sort === "newest") {
      filtered.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    } else if (sort === "oldest") {
      filtered.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
    } else if (sort === "most-liked") {
      filtered.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));
    }

    return filtered;
  };

  // Analytics data preparation
  const getPostsAnalytics = () => {
    const now = new Date();
    const data: { [key: string]: number } = {};

    if (analyticsTimeframe === "week") {
      // Last 7 days
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dayName = days[date.getDay()];
        data[dayName] = 0;
      }

      allPosts.forEach((post) => {
        const postDate = post.createdAt.toDate();
        const diffTime = now.getTime() - postDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 7) {
          const dayName = days[postDate.getDay()];
          data[dayName]++;
        }
      });
    } else {
      // Last 30 days
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const key = `${date.getMonth() + 1}/${date.getDate()}`;
        data[key] = 0;
      }

      allPosts.forEach((post) => {
        const postDate = post.createdAt.toDate();
        const diffTime = now.getTime() - postDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 30) {
          const key = `${postDate.getMonth() + 1}/${postDate.getDate()}`;
          if (key in data) {
            data[key]++;
          }
        }
      });
    }

    const values = Object.values(data);
    const maxVal = Math.max(...values, 0);

    return {
      labels: Object.keys(data),
      datasets: [
        {
          label: "Posts",
          data: values,
          // A. Primary color for Posts bar chart
          backgroundColor: values.map((v) =>
            v === maxVal && maxVal > 0 ? "#F4A261" : "#6FA8DC"
          ),
          borderColor: values.map((v) =>
            v === maxVal && maxVal > 0 ? "#F4A261" : "#6FA8DC"
          ),
          borderWidth: 2,
        },
      ],
    };
  };

  const getUsersAnalytics = () => {
    const now = new Date();
    const data: { [key: string]: number } = {};

    if (analyticsTimeframe === "week") {
      // Last 7 days
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dayName = days[date.getDay()];
        data[dayName] = 0;
      }

      allUsers.forEach((user) => {
        if (user.createdAt) {
          const userDate = user.createdAt.toDate();
          const diffTime = now.getTime() - userDate.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays < 7) {
            const dayName = days[userDate.getDay()];
            data[dayName]++;
          }
        }
      });
    } else {
      // Last 30 days
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const key = `${date.getMonth() + 1}/${date.getDate()}`;
        data[key] = 0;
      }

      allUsers.forEach((user) => {
        if (user.createdAt) {
          const userDate = user.createdAt.toDate();
          const diffTime = now.getTime() - userDate.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays < 30) {
            const key = `${userDate.getMonth() + 1}/${userDate.getDate()}`;
            if (key in data) {
              data[key]++;
            }
          }
        }
      });
    }

    const values = Object.values(data);
    const maxVal = Math.max(...values, 0);

    return {
      labels: Object.keys(data),
      datasets: [
        {
          label: "New Users",
          data: values,
          // A. Secondary color for Users line chart
          backgroundColor: "rgba(47, 75, 124, 0.15)",
          borderColor: "#2F4B7C",
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          // A. Accent (#F4A261) highlights peak activity point
          pointBackgroundColor: values.map((v) =>
            v === maxVal && maxVal > 0 ? "#F4A261" : "#2F4B7C"
          ),
          pointBorderColor: values.map((v) =>
            v === maxVal && maxVal > 0 ? "#F4A261" : "#2F4B7C"
          ),
          pointRadius: values.map((v) =>
            v === maxVal && maxVal > 0 ? 6 : 3
          ),
        },
      ],
    };
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fbfbfe]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6FA8DC] mx-auto"></div>
          <p className="mt-4 text-[#22181C]">Checking admin access...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const stats = {
    totalUsers: allUsers.filter((u) => u.role !== "admin").length,
    totalPosts: allPosts.length,
    bannedUsers: allUsers.filter((u) => u.banned).length,
    admins: allUsers.filter((u) => u.role === "admin").length,
    privatePosts: allPosts.filter((p) => p.isPrivate).length,
    draftPosts: allPosts.filter((p) => p.isDraft).length,
  };

  const filteredAndSortedPosts = getFilteredAndSortedPosts(allPosts, postFilter, postSort);
  const recentPosts = filteredAndSortedPosts.slice(0, 10);
  const recentUsers = allUsers
    .filter((u) => u.role !== "admin")
    .slice(-10)
    .reverse();

  const postsChartData = getPostsAnalytics();
  const usersChartData = getUsersAnalytics();

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        padding: 12,
        titleFont: {
          size: 14,
        },
        bodyFont: {
          size: 13,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        },
      },
    },
  };

  return (
    <div className="flex h-screen bg-[#fbfbfe]">
      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-[#2F4B7C]">Nook Admin</h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          <NavItem
            icon={<DashboardIcon />}
            label="Dashboard"
            active={activeView === "dashboard"}
            onClick={() => setActiveView("dashboard")}
          />
          <NavItem
            icon={<UsersIcon />}
            label="Users"
            active={activeView === "users"}
            onClick={() => setActiveView("users")}
          />
          <NavItem
            icon={<PostsIcon />}
            label="Posts"
            active={activeView === "posts"}
            onClick={() => setActiveView("posts")}
          />
          <NavItem
            icon={<ReportsIcon />}
            label="Reports"
            active={activeView === "reports"}
            onClick={() => setActiveView("reports")}
            badge={pendingReportCount > 0 ? <span className="w-2.5 h-2.5 bg-[#F4A261] rounded-full" /> : undefined}
          />
          <NavItem
            icon={<SettingsIcon />}
            label="Settings"
            active={activeView === "settings"}
            onClick={() => setActiveView("settings")}
          />
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg transition"
          >
            <LogoutIcon />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* TOP HEADER */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          {/* Search */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search users, posts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6FA8DC] focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* Right side: Notifications & Profile */}
          <div className="flex items-center gap-4">
            {/* Notifications */}
            <button className="relative p-2 hover:bg-gray-100 rounded-lg transition">
              <BellIcon className="w-6 h-6 text-gray-600" />
              {systemNotifications.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              )}
            </button>

            {/* Admin Profile - Display Only */}
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-[#6FA8DC] to-[#2F4B7C] flex items-center justify-center text-white font-bold">
                {user?.email?.[0].toUpperCase() || "A"}
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">Admin</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
            </div>
          </div>
        </header>

        {/* CONTENT AREA */}
        <main className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6FA8DC] mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading...</p>
              </div>
            </div>
          ) : (
            <>
              {/* DASHBOARD VIEW */}
              {activeView === "dashboard" && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900">Dashboard Overview</h2>

                  {/* Stats Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <StatsCard label="Total Users" value={stats.totalUsers} color="#6FA8DC" />
                    <StatsCard label="Total Posts" value={stats.totalPosts} color="#2F4B7C" />
                    <StatsCard label="Admins" value={stats.admins} color="#6FA8DC" />
                    <StatsCard label="Banned Users" value={stats.bannedUsers} color="#F4A261" />
                    <StatsCard label="Private Posts" value={stats.privatePosts} color="#2F4B7C" />
                    <StatsCard label="Draft Posts" value={stats.draftPosts} color="#F4A261" />
                  </div>

                  {/* CHARTS & ANALYTICS SECTION */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-semibold text-gray-900">Analytics Overview</h3>
                      <select
                        value={analyticsTimeframe}
                        onChange={(e) => setAnalyticsTimeframe(e.target.value as AnalyticsTimeframe)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#6FA8DC] focus:border-transparent outline-none"
                      >
                        <option value="week">Last 7 Days</option>
                        <option value="month">Last 30 Days</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Posts Activity Chart */}
                      <div className="bg-white rounded-lg border border-[#E5E7EB] p-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-4">Posts Activity</h4>
                        <div className="h-64">
                          <Bar key={`posts-${analyticsTimeframe}`} data={postsChartData} options={chartOptions} />
                        </div>
                      </div>

                      {/* New Users Chart */}
                      <div className="bg-white rounded-lg border border-[#E5E7EB] p-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-4">New Users</h4>
                        <div className="h-64">
                          <Line key={`users-${analyticsTimeframe}`} data={usersChartData} options={chartOptions} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recent Posts Table with Filters */}
                  <div className="bg-white rounded-lg border border-gray-200">
                    <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">Recent Posts</h3>
                      
                      {/* Filter and Sort Controls */}
                      <div className="flex items-center gap-3">
                        <select
                          value={postFilter}
                          onChange={(e) => setPostFilter(e.target.value as PostFilter)}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#6FA8DC] focus:border-transparent outline-none"
                        >
                          <option value="all">All Posts</option>
                          <option value="public">Public Only</option>
                          <option value="private">Private Only</option>
                          <option value="draft">Drafts Only</option>
                        </select>

                        <select
                          value={postSort}
                          onChange={(e) => setPostSort(e.target.value as PostSort)}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#6FA8DC] focus:border-transparent outline-none"
                        >
                          <option value="newest">Newest First</option>
                          <option value="oldest">Oldest First</option>
                          <option value="most-liked">Most Liked</option>
                        </select>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Post</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Author</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Likes</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {recentPosts.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                No posts found with the selected filters.
                              </td>
                            </tr>
                          ) : (
                            recentPosts.map((post) => (
                              <tr key={post.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4">
                                  <div className="font-medium text-gray-900">{post.title || "Untitled"}</div>
                                  <div className="text-sm text-gray-500 truncate max-w-xs">{post.content.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').substring(0, 50)}...</div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">{post.username || post.userEmail}</td>
                                <td className="px-6 py-4 text-sm text-gray-600">{post.createdAt.toDate().toLocaleDateString()}</td>
                                <td className="px-6 py-4 text-sm text-gray-600">{post.likes?.length || 0}</td>
                                <td className="px-6 py-4">
                                  <div className="flex gap-1">
                                    {post.isPrivate && <StatusBadge color="purple">Private</StatusBadge>}
                                    {post.isDraft && <StatusBadge color="yellow">Draft</StatusBadge>}
                                    {!post.isPrivate && !post.isDraft && <StatusBadge color="green">Published</StatusBadge>}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <button
                                    onClick={() => deletePost(post.id, post.title || "Untitled")}
                                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Recent Users Table (Non-Admins) - No Actions */}
                  <div className="bg-white rounded-lg border border-gray-200">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-900">Recent Users (Non-Admins)</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {recentUsers.map((user) => (
                            <tr key={user.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 text-sm text-gray-900">{user.email || "No email"}</td>
                              <td className="px-6 py-4 text-sm text-gray-600">{user.username || "Not set"}</td>
                              <td className="px-6 py-4">
                                <StatusBadge color="gray">User</StatusBadge>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${user.banned ? 'bg-red-100 text-red-600' : 'bg-[#EBF3EC] text-[#7A9E7E]'}`}>
                                  {user.banned ? 'Banned' : 'Active'}
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

              {/* USERS VIEW - Separated into Regular Users and Admins */}
              {activeView === "users" && (
                <div className="space-y-8">
                  {/* Regular Users Table */}
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">
                      Regular Users ({allUsers.filter(u => u.role !== "admin").length})
                    </h2>
                    <UsersTable
                      users={allUsers.filter(u => u.role !== "admin")}
                      onToggleBan={toggleBanUser}
                      onMakeAdmin={makeAdmin}
                      onRemoveAdmin={removeAdmin}
                    />
                  </div>

                  {/* Admins Table */}
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">
                      Admins ({allUsers.filter(u => u.role === "admin").length})
                    </h2>
                    <UsersTable
                      users={allUsers.filter(u => u.role === "admin")}
                      onToggleBan={toggleBanUser}
                      onMakeAdmin={makeAdmin}
                      onRemoveAdmin={removeAdmin}
                    />
                  </div>
                </div>
              )}

              {/* POSTS VIEW */}
              {activeView === "posts" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-gray-900">All Posts ({filteredAndSortedPosts.length})</h2>
                    
                    <div className="flex items-center gap-3">
                      <select
                        value={postFilter}
                        onChange={(e) => setPostFilter(e.target.value as PostFilter)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#6FA8DC] focus:border-transparent outline-none"
                      >
                        <option value="all">All Posts</option>
                        <option value="public">Public Only</option>
                        <option value="private">Private Only</option>
                        <option value="draft">Drafts Only</option>
                      </select>

                      <select
                        value={postSort}
                        onChange={(e) => setPostSort(e.target.value as PostSort)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#6FA8DC] focus:border-transparent outline-none"
                      >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="most-liked">Most Liked</option>
                      </select>
                    </div>
                  </div>
                  <PostsTable posts={filteredAndSortedPosts} onDelete={deletePost} />
                </div>
              )}

              {/* REPORTS VIEW */}
              {activeView === "reports" && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900">Reports</h2>
                  <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                    <ReportsIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No reports yet. Reports will appear here when users flag content.</p>
                  </div>
                </div>
              )}

              {/* SETTINGS VIEW */}
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

      {/* System Health Toast */}
      {systemNotifications.length > 0 && (
        <SystemHealthToast notifications={systemNotifications} />
      )}
    </div>
  );
}

// ==================== SYSTEM HEALTH TOAST ====================

function SystemHealthToast({ notifications }: { notifications: string[] }) {
  return (
    <div className="fixed top-6 right-6 z-50 max-w-sm">
      <div
        className="bg-[#F6F3EC] border border-[#6FA8DC] rounded-lg p-4 shadow-lg"
        style={{ backgroundColor: '#F6F3EC', borderColor: '#6FA8DC' }}
      >
        <div className="flex items-start gap-3">
          <div className="w-5 h-5 text-[#6FA8DC] shrink-0 mt-0.5">
            <svg fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">System Health</h4>
            <ul className="space-y-1">
              {notifications.map((notification, index) => (
                <li key={index} className="text-xs text-gray-700 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[#6FA8DC] rounded-full shrink-0"></div>
                  {notification}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== COMPONENTS ====================

function NavItem({ icon, label, active, badge, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; badge?: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
        active ? "bg-[#6FA8DC] text-white" : "text-gray-700 hover:bg-gray-100"
      }`}
    >
      <div className={active ? "text-white" : "text-gray-500"}>{icon}</div>
      <span className="font-medium flex-1 text-left">{label}</span>
      {badge ? <div className="flex items-center justify-end">{badge}</div> : null}
    </button>
  );
}

function StatsCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="text-3xl font-bold mt-2" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ children, color }: { children: React.ReactNode; color: "blue" | "green" | "yellow" | "red" | "purple" | "gray" }) {
  const colors = {
    blue: "bg-blue-100 text-blue-700",
    green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-700",
    red: "bg-red-100 text-red-700",
    purple: "bg-purple-100 text-purple-700",
    gray: "bg-gray-100 text-gray-700",
  };

  return <span className={`px-2 py-1 rounded text-xs font-medium ${colors[color]}`}>{children}</span>;
}

function UsersTable({
  users,
  onToggleBan,
  onMakeAdmin,
  onRemoveAdmin,
}: {
  users: User[];
  onToggleBan: (id: string, banned: boolean, email: string) => void;
  onMakeAdmin: (id: string, email: string) => void;
  onRemoveAdmin: (id: string, email: string) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">{user.email || "No email"}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{user.username || "Not set"}</td>
                <td className="px-6 py-4">
                  {user.role === "admin" ? (
                    <StatusBadge color="blue">Admin</StatusBadge>
                  ) : (
                    <StatusBadge color="gray">User</StatusBadge>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${user.banned ? 'bg-red-100 text-red-600' : 'bg-[#EBF3EC] text-[#7A9E7E]'}`}>
                    {user.banned ? 'Banned' : 'Active'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-4">
                    {user.role === "admin" ? (
                      <button
                        onClick={() => onRemoveAdmin(user.id, user.email || "")}
                        className="text-gray-600 hover:text-gray-800 text-sm font-medium px-3 py-1.5 rounded hover:bg-gray-100 transition"
                      >
                        Remove Admin
                      </button>
                    ) : (
                      <button
                        onClick={() => onMakeAdmin(user.id, user.email || "")}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium px-3 py-1.5 rounded hover:bg-blue-50 transition"
                      >
                        Make Admin
                      </button>
                    )}
                    <button
                      onClick={() => onToggleBan(user.id, user.banned || false, user.email || "")}
                      className={`text-sm font-medium px-3 py-1.5 rounded transition ${
                        user.banned
                          ? "text-green-600 hover:text-green-800 hover:bg-green-50"
                          : "text-red-600 hover:text-red-800 hover:bg-red-50"
                      }`}
                    >
                      {user.banned ? "Unban" : "Ban"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PostsTable({ posts, onDelete }: { posts: Post[]; onDelete: (id: string, title: string) => void }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Post</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Author</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Likes</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {posts.map((post) => (
              <tr key={post.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{post.title || "Untitled"}</div>
                  <div className="text-sm text-gray-500 truncate max-w-xs">{post.content.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').substring(0, 50)}...</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{post.username || post.userEmail}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{post.createdAt.toDate().toLocaleDateString()}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{post.likes?.length || 0}</td>
                <td className="px-6 py-4">
                  <div className="flex gap-1">
                    {post.isPrivate && <StatusBadge color="purple">Private</StatusBadge>}
                    {post.isDraft && <StatusBadge color="yellow">Draft</StatusBadge>}
                    {!post.isPrivate && !post.isDraft && <StatusBadge color="green">Published</StatusBadge>}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <button onClick={() => onDelete(post.id, post.title || "Untitled")} className="text-red-600 hover:text-red-800 text-sm font-medium">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== ICONS ====================

function DashboardIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function PostsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
    </svg>
  );
}

function ReportsIcon({ className }: { className?: string }) {
  return (
    <svg className={className || "w-5 h-5"} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}