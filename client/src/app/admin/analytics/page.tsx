'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Briefcase, CalendarDays, Globe2, ShieldCheck, Sparkles, TrendingUp, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { fetchAnalyticsSummary, AnalyticsSummary } from '@/services/adminService';

const statusLabels = [
  { key: 'pending', label: 'Pending', color: 'from-yellow-500 to-yellow-300' },
  { key: 'reviewed', label: 'Reviewed', color: 'from-blue-500 to-blue-300' },
  { key: 'contacted', label: 'Contacted', color: 'from-violet-500 to-violet-300' },
  { key: 'completed', label: 'Completed', color: 'from-emerald-500 to-emerald-300' },
];

const AdminAnalyticsPage = () => {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSummary = async () => {
      try {
        setLoading(true);
        const { summary } = await fetchAnalyticsSummary();
        setSummary(summary);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load analytics');
      } finally {
        setLoading(false);
      }
    };

    loadSummary();
  }, []);

  const statusStatistics = useMemo(() => {
    if (!summary) return [];

    return statusLabels.map((status) => ({
      ...status,
      count: summary.statusCounts?.[status.key] ?? 0,
    }));
  }, [summary]);

  const topDestinations = summary?.topDestinations || [];
  const totalTopDestinations = topDestinations.reduce((sum, item) => sum + item.count, 0);

  const totalUsers = summary?.totalUsers ?? 0;
  const totalAdmins = summary?.totalAdmins ?? 0;
  const totalSubmissions = summary?.totalSubmissions ?? 0;
  const adminShare = totalUsers > 0 ? Math.round((totalAdmins / totalUsers) * 100) : 0;

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-sky-500" />
          <p className="text-sm font-medium text-slate-500">Loading analytics dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center shadow-lg shadow-red-100/40 max-w-lg">
          <p className="text-4xl">⚠️</p>
          <h2 className="mt-4 text-xl font-semibold text-red-700">Analytics load failed</h2>
          <p className="mt-2 text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-8">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-lg shadow-slate-900/10">
        <div className="relative">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.45em] text-slate-300 font-medium">Total Users</p>
              <p className="mt-3 text-4xl font-semibold tracking-tight text-white">{totalUsers}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.45em] text-slate-300 font-medium">Total Submissions</p>
              <p className="mt-3 text-4xl font-semibold tracking-tight text-white">{totalSubmissions}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.45em] text-slate-300 font-medium">Admin Ratio</p>
              <p className="mt-3 text-4xl font-semibold tracking-tight text-white">{adminShare}%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="space-y-4 rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm shadow-slate-200/50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-900">Submission Health</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Status Breakdown</h2>
            </div>
            <div className="rounded-full bg-slate-100 px-4 py-2 text-xs font-medium text-slate-900 shadow-sm shadow-slate-200/80">
              Last updated just now
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {statusStatistics.map((item) => {
              const progress = totalSubmissions > 0 ? Math.max(4, Math.round((item.count / totalSubmissions) * 100)) : 4;
              return (
                <div key={item.key} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-900">{item.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">{item.count}</p>
                    </div>
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                      <BarChart3 className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full bg-gradient-to-r ${item.color}`} style={{ width: `${progress}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-slate-900">
              <TrendingUp className="h-4 w-4 text-slate-900" />
              <p className="text-sm font-medium">Performance snapshot</p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-3 shadow-sm shadow-slate-200/50">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-900">Average Approval</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{totalSubmissions ? `${Math.round(((summary?.statusCounts?.completed ?? 0) / totalSubmissions) * 100)}%` : '0%'}</p>
              </div>
              <div className="rounded-2xl bg-white p-3 shadow-sm shadow-slate-200/50">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-900">Pending Attention</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{summary?.statusCounts?.pending ?? 0}</p>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4 rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm shadow-slate-200/50">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-3xl bg-slate-100 text-slate-700 shadow-sm shadow-slate-200/50">
              <Globe2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.35em] text-slate-900">Top Destinations</p>
              <h3 className="text-xl font-semibold tracking-tight text-slate-900">Popular Countries</h3>
            </div>
          </div>

          <div className="space-y-3">
            {topDestinations.length > 0 ? (
              topDestinations.map((destination) => {
                const ratio = totalTopDestinations > 0 ? Math.max(6, Math.round((destination.count / totalTopDestinations) * 100)) : 6;
                return (
                  <div key={destination.destination} className="rounded-3xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{destination.destination}</p>
                        <p className="text-xs text-slate-500">{destination.count} applications</p>
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">{Math.round((destination.count / (totalSubmissions || 1)) * 100)}%</div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-sky-500" style={{ width: `${ratio}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                No destination data available yet.
              </div>
            )}
          </div>

        </aside>
      </div>
    </motion.div>
  );
};

export default AdminAnalyticsPage;
