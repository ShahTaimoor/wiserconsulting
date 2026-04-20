'use client';

import { useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { fetchUsers, updateRole } from '@/redux/slices/admin/adminSlice';
import ReorderableTable, { TableColumnDef } from '@/components/ui/reorderable-table';
import { motion } from 'framer-motion';
import { Users, ShieldCheck, UserCheck, TrendingUp, CircleUserRound } from 'lucide-react';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { 
      duration: 0.3,
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 }
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
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-900">{user.name}</span>
            <span className="text-xs text-slate-500">{user.email}</span>
          </div>
        );
      case "role":
        return (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md border ${
            user.role === 1 
              ? 'bg-purple-100 text-purple-700 border-purple-300'
              : 'bg-blue-100 text-blue-700 border-blue-300'
          }`}>
            {user.role === 1 ? (
              <ShieldCheck className="w-3 h-3" />
            ) : (
              <CircleUserRound className="w-3 h-3" />
            )}
            {user.role === 1 ? 'Administrator' : 'General User'}
          </span>
        );
      case "createdAt":
        return (
          <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-900">
              {new Date(user.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </span>
            <span className="text-xs text-slate-500">Registered</span>
          </div>
        );
      case "actions":
        return (
          <button
            onClick={() => handleRoleUpdate(user._id, user.role === 1 ? 0 : 1)}
            className={`flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-md border transition-colors ${
              user.role === 1 
                ? 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                : 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200'
            }`}
          >
            {user.role === 1 ? <UserCheck className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
            {user.role === 1 ? 'Demote' : 'Promote'}
          </button>
        );
      default:
        return user[key];
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-slate-600">Loading users...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg max-w-md text-center">
          <h3 className="font-semibold mb-2">Error</h3>
          <p className="text-sm mb-4">{error}</p>
          <button onClick={() => dispatch(fetchUsers())} className="px-4 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative space-y-6 py-6"
    >
      {/* Header & Stats Section */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <motion.div variants={itemVariants} className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
          <p className="text-slate-600 text-sm mt-2">Configure system permissions and manage user access levels.</p>
        </motion.div>

        {/* Stats Section - Clean Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
            {[
            { label: "Total Admins", value: totalAdmins, icon: ShieldCheck, color: "purple" },
            { label: "Standard Users", value: totalRegularUsers, icon: CircleUserRound, color: "blue" },
            { label: "System Reach", value: users.length, icon: Users, color: "emerald" }
            ].map((stat) => (
            <motion.div
                key={stat.label}
                variants={itemVariants}
                className={`p-4 rounded-lg border transition-colors duration-200 ${
                    stat.color === 'purple' ? 'bg-purple-50 border-purple-200' : 
                    stat.color === 'blue' ? 'bg-blue-50 border-blue-200' : 'bg-emerald-50 border-emerald-200'
                }`}
            >
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                        stat.color === 'purple' ? 'bg-purple-600 text-white' : 
                        stat.color === 'blue' ? 'bg-blue-600 text-white' : 
                        'bg-emerald-600 text-white'
                    }`}>
                        <stat.icon className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{stat.label}</p>
                        <p className="text-2xl font-semibold text-slate-900">{stat.value}</p>
                    </div>
                </div>
            </motion.div>
            ))}
        </div>
      </div>

      {/* Table Section */}
      <motion.div variants={itemVariants} className="bg-white border border-slate-200 rounded-lg p-4">
        <ReorderableTable 
            data={users} 
            columns={columns} 
            renderCell={renderCell} 
        />
      </motion.div>
    </motion.div>
  );
};

export default AdminUsers;
