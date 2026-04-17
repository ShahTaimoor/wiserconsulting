'use client';

import { useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { fetchUsers, updateRole } from '@/redux/slices/admin/adminSlice';
import ReorderableTable, { TableColumnDef } from '@/components/ui/reorderable-table';
import { motion } from 'framer-motion';
import { Users, ShieldCheck, UserCheck, TrendingUp, CircleUserRound } from 'lucide-react';

const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { 
      duration: 0.5,
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const AdminUsers = () => {
  const dispatch = useAppDispatch();
  const { users, loading, error } = useAppSelector((state) => state.admin);

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  const handleRoleUpdate = async (userId: string, newRole: number) => {
    await dispatch(updateRole({ userId, role: newRole }));
  };

  const totalAdmins = useMemo(() => users.filter(u => u.role === 1).length, [users]);
  const totalRegularUsers = useMemo(() => users.filter(u => u.role === 0).length, [users]);

  // Define Columns for ReorderableTable
  const columns: TableColumnDef[] = [
    { key: "user", label: "User", width: "300px" },
    { key: "role", label: "Role", width: "150px" },
    { key: "createdAt", label: "Created", width: "200px" },
    { key: "actions", label: "Actions", width: "150px" },
  ];

  // Cell Renderer for Users Table
  const renderCell = (user: any, key: string) => {
    switch (key) {
      case "user":
        return (
          <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-700">{user.name}</span>
            <span className="text-xs text-slate-400 font-normal">{user.email}</span>
          </div>
        );
      case "role":
        return (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium uppercase tracking-wider rounded-full border backdrop-blur-md transition-all duration-300 ${
            user.role === 1 
              ? 'bg-purple-500/10 text-purple-500 border-purple-200/50 shadow-[0_0_15px_rgba(168,85,247,0.08)]'
              : 'bg-emerald-500/10 text-emerald-500 border-emerald-200/50 shadow-[0_0_15px_rgba(16,185,129,0.08)]'
          }`}>
            {user.role === 1 ? (
              <ShieldCheck className="w-3 h-3 opacity-80" />
            ) : (
              <CircleUserRound className="w-3 h-3 opacity-80" />
            )}
            {user.role === 1 ? 'Administrator' : 'General User'}
          </span>
        );
      case "createdAt":
        return (
          <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-600">
                {new Date(user.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
                })}
            </span>
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">Registered On</span>
          </div>
        );
      case "actions":
        return (
          <button
            onClick={() => handleRoleUpdate(user._id, user.role === 1 ? 0 : 1)}
            className={`group flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider transition-all duration-300 px-4 py-2 rounded-xl border backdrop-blur-sm active:scale-95 ${
              user.role === 1 
                ? 'text-red-500 border-red-100/50 bg-red-500/5 hover:bg-red-500/10 hover:border-red-200 hover:shadow-[0_0_20px_rgba(239,68,68,0.1)]'
                : 'text-emerald-500 border-emerald-100/50 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-200 hover:shadow-[0_0_20px_rgba(16,185,129,0.1)]'
            }`}
          >
            {user.role === 1 ? <UserCheck className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            {user.role === 1 ? 'Demote' : 'Promote'}
          </button>
        );
      default:
        return user[key];
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-6">
        <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
            <div className="absolute inset-0 rounded-full border-4 border-slate-900 border-t-transparent animate-spin" />
        </div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400 animate-pulse">Syncing User Data</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-red-50 border-2 border-red-100 text-red-600 px-10 py-8 rounded-[32px] flex flex-col items-center gap-4 text-center shadow-2xl shadow-red-500/10"
        >
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-3xl">🚫</div>
          <div>
            <h3 className="text-xl font-medium text-red-900">System Error</h3>
            <p className="font-medium text-sm mt-1">{error}</p>
          </div>
          <button onClick={() => dispatch(fetchUsers())} className="mt-2 px-6 py-2 bg-red-600 text-white rounded-xl text-xs font-medium hover:bg-red-700 transition-colors">Retry Connection</button>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative space-y-10 py-6 min-h-screen"
    >
      {/* Decorative Mesh Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[20%] left-[-5%] w-[40%] h-[40%] bg-blue-500/5 blur-[100px] rounded-full" />
      </div>

      {/* Sticky Header & Stats Section */}
      <div className="sticky top-[-1px] z-30 bg-background/80 backdrop-blur-xl pb-10 pt-2 transition-all duration-300 border-b border-white/40 shadow-[0_1px_0_rgba(0,0,0,0.05)] -mx-6 px-7">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-10 px-1">
            <motion.div variants={itemVariants}>
                <h1 className="text-3xl font-medium tracking-tight text-slate-900 mt-2 selection:bg-purple-200">Users</h1>
                <div className="h-0.5 w-10 bg-purple-600 rounded-full mt-1.5 mb-3" />
                <p className="text-slate-500 text-sm font-medium max-w-md">Configure sophisticated system permissions and audit administrative access levels.</p>
            </motion.div>
        </div>

        {/* Stats Section with Glassmorphism */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-1">
            {[
            { label: "Total Admins", value: totalAdmins, icon: ShieldCheck, color: "purple" },
            { label: "Standard Users", value: totalRegularUsers, icon: CircleUserRound, color: "blue" },
            { label: "System Reach", value: users.length, icon: Users, color: "emerald" }
            ].map((stat) => (
            <motion.div
                key={stat.label}
                variants={itemVariants}
                whileHover={{ y: -6, scale: 1.02 }}
                className="group relative bg-white/90 p-6 rounded-[30px] border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_25px_50px_-15px_rgba(0,0,0,0.08)] transition-all duration-500 overflow-hidden backdrop-blur-sm"
            >
                {/* Inner Glow/Gradient */}
                <div className={`absolute -inset-1 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl -z-10 ${
                    stat.color === 'purple' ? 'bg-purple-500/10' : 
                    stat.color === 'blue' ? 'bg-blue-500/10' : 'bg-emerald-500/10'
                }`} />
                
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-5">
                        <div className={`w-14 h-14 rounded-[20px] flex items-center justify-center transition-all duration-500 group-hover:shadow-xl ${
                            stat.color === 'purple' ? 'bg-purple-600 text-white shadow-purple-500/20' : 
                            stat.color === 'blue' ? 'bg-blue-600 text-white shadow-blue-500/20' : 
                            'bg-emerald-600 text-white shadow-emerald-500/20'
                        }`}>
                            <stat.icon className="w-6 h-6 transition-transform group-hover:scale-110" />
                        </div>
                        <div>
                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-0.5">{stat.label}</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-medium text-slate-900 tracking-tighter">{stat.value}</span>
                                <span className="text-[10px] font-medium text-slate-300 uppercase tracking-tighter">Profiles</span>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
            ))}
        </div>
      </div>

      {/* Modern Table Integration */}
      <motion.div variants={itemVariants} className="pt-6 px-1">
        <div className="rounded-[40px] border border-slate-200 bg-white/60 backdrop-blur-sm p-2 shadow-2xl shadow-slate-200/20">
            <ReorderableTable 
                data={users} 
                columns={columns} 
                renderCell={renderCell} 
            />
        </div>
      </motion.div>
    </motion.div>
  );
};

export default AdminUsers;
