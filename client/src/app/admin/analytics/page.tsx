'use client';

import { useEffect, useMemo, useState } from 'react';
import { SheetPage, SheetTable, SheetMessage, SheetLoading, Thead, Th, Tr, Td, EmptyRow } from '@/components/admin/Sheet';
import { fetchAnalyticsSummary, AnalyticsSummary } from '@/services/adminService';

const statusLabels = [
  { key: 'pending', label: 'Pending' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'completed', label: 'Completed' },
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
      <SheetPage title="Analytics">
        <SheetLoading label="Loading analytics..." />
      </SheetPage>
    );
  }

  if (error) {
    return (
      <SheetPage title="Analytics">
        <SheetMessage>{error}</SheetMessage>
      </SheetPage>
    );
  }

  const approvalRate = totalSubmissions ? Math.round(((summary?.statusCounts?.completed ?? 0) / totalSubmissions) * 100) : 0;
  const summaryRows: { label: string; value: string | number }[] = [
    { label: 'Users', value: totalUsers },
    { label: 'Staff (admins)', value: `${totalAdmins} (${adminShare}%)` },
    { label: 'Form submissions', value: totalSubmissions },
    { label: 'Completed', value: `${approvalRate}%` },
    { label: 'Pending attention', value: summary?.statusCounts?.pending ?? 0 },
  ];

  const Bar = ({ percent, color }: { percent: number; color: string }) => (
    <div className="flex items-center gap-2">
      <div className="h-2.5 w-full min-w-[80px] overflow-hidden rounded-sm bg-slate-200">
        <div className={`h-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-slate-600">{percent}%</span>
    </div>
  );
  const statusColor: Record<string, string> = {
    pending: 'bg-amber-400',
    reviewed: 'bg-blue-500',
    contacted: 'bg-violet-500',
    completed: 'bg-emerald-500',
  };

  return (
    <SheetPage title="Analytics" subtitle="A quick summary of users and form submissions">
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <div>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-600">Summary</h2>
            <SheetTable count={summaryRows.length} unit="metrics" minWidth={320}>
              <Thead>
                <Th>Metric</Th>
                <Th className="w-40 text-right">Value</Th>
              </Thead>
              <tbody>
                {summaryRows.map((row, index) => (
                  <Tr key={row.label} n={index + 1}>
                    <Td className="font-medium">{row.label}</Td>
                    <Td className="text-right font-semibold tabular-nums">{row.value}</Td>
                  </Tr>
                ))}
              </tbody>
            </SheetTable>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-600">Status breakdown</h2>
            <SheetTable count={statusStatistics.length} unit="statuses" minWidth={420}>
              <Thead>
                <Th>Status</Th>
                <Th className="w-20 text-right">Count</Th>
                <Th className="w-56">Share</Th>
              </Thead>
              <tbody>
                {statusStatistics.map((item, index) => {
                  const percent = totalSubmissions > 0 ? Math.round((item.count / totalSubmissions) * 100) : 0;
                  return (
                    <Tr key={item.key} n={index + 1}>
                      <Td className="font-medium">{item.label}</Td>
                      <Td className="text-right font-semibold tabular-nums">{item.count}</Td>
                      <Td><Bar percent={percent} color={statusColor[item.key] ?? 'bg-slate-400'} /></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </SheetTable>
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-600">Popular countries</h2>
          <SheetTable count={topDestinations.length} unit="countries" minWidth={420}>
            <Thead>
              <Th>Country</Th>
              <Th className="w-28 text-right">Applications</Th>
              <Th className="w-56">Share</Th>
            </Thead>
            <tbody>
              {topDestinations.length === 0 ? (
                <EmptyRow colSpan={3}>No destination data available yet.</EmptyRow>
              ) : (
                topDestinations.map((destination, index) => {
                  const percent = totalTopDestinations > 0 ? Math.round((destination.count / totalTopDestinations) * 100) : 0;
                  return (
                    <Tr key={destination.destination} n={index + 1}>
                      <Td className="font-medium">{destination.destination}</Td>
                      <Td className="text-right font-semibold tabular-nums">{destination.count}</Td>
                      <Td><Bar percent={percent} color="bg-sky-500" /></Td>
                    </Tr>
                  );
                })
              )}
            </tbody>
          </SheetTable>
        </div>
      </div>
    </SheetPage>
  );
};

export default AdminAnalyticsPage;
