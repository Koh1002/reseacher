// =============================================
// Chart Display Component
// =============================================

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import type { ChartSpec } from '../types';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface ChartDisplayProps {
  spec: ChartSpec;
  height?: number;
}

export function ChartDisplay({ spec, height = 200 }: ChartDisplayProps) {
  const chartData = useMemo(
    () => ({
      labels: spec.labels,
      datasets: spec.datasets.map((ds) => ({
        ...ds,
        borderWidth: ds.borderColor ? 2 : 0,
        fill: spec.type === 'line',
      })),
    }),
    [spec]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
          labels: {
            boxWidth: 12,
            font: { size: 11 },
          },
        },
        title: {
          display: !!spec.title,
          text: spec.title || '',
          font: { size: 13 },
        },
      },
      scales:
        spec.type === 'bar' || spec.type === 'line'
          ? {
              y: {
                beginAtZero: true,
                ticks: { font: { size: 10 } },
              },
              x: {
                ticks: { font: { size: 10 } },
              },
            }
          : undefined,
    }),
    [spec.title, spec.type]
  );

  const pieOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right' as const,
          labels: {
            boxWidth: 12,
            font: { size: 10 },
          },
        },
        title: {
          display: !!spec.title,
          text: spec.title || '',
          font: { size: 13 },
        },
      },
    }),
    [spec.title]
  );

  return (
    <div style={{ height }}>
      {spec.type === 'bar' && <Bar data={chartData} options={options} />}
      {spec.type === 'line' && <Line data={chartData} options={options} />}
      {spec.type === 'pie' && <Pie data={chartData} options={pieOptions} />}
      {spec.type === 'doughnut' && <Doughnut data={chartData} options={pieOptions} />}
      {spec.type === 'table' && <TableDisplay spec={spec} />}
    </div>
  );
}

function TableDisplay({ spec }: { spec: ChartSpec }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 px-3 text-left">ラベル</th>
            {spec.datasets.map((ds, i) => (
              <th key={i} className="py-2 px-3 text-right">
                {ds.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.labels.map((label, rowIdx) => (
            <tr key={rowIdx} className="border-b">
              <td className="py-2 px-3">{label}</td>
              {spec.datasets.map((ds, colIdx) => (
                <td key={colIdx} className="py-2 px-3 text-right">
                  {ds.data[rowIdx]?.toLocaleString()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
