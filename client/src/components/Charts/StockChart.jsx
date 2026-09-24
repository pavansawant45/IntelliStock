import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const StockChart = ({ data, title, color = "#3b82f6" }) => {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4 text-white">{title}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="date" 
              stroke="#9ca3af"
              fontSize={12}
            />
            <YAxis 
              stroke="#9ca3af"
              fontSize={12}
              domain={['auto', 'auto']}
              tickFormatter={(value) => Math.round(value)}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#f9fafb'
              }}
            />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke={color}
              strokeWidth={2}
              dot={{ fill: color, strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: color, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default StockChart
