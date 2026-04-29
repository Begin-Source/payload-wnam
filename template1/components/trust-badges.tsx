import { CheckCircle, Star, FileText, Users } from "lucide-react"

export function TrustBadges() {
  const stats = [
    { icon: FileText, value: "500+", label: "深度评测" },
    { icon: Star, value: "2000+", label: "产品测试" },
    { icon: Users, value: "100万+", label: "月度读者" },
    { icon: CheckCircle, value: "8年", label: "专业经验" },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
      {stats.map((stat) => (
        <div key={stat.label} className="text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <stat.icon className="w-6 h-6 text-primary" />
          </div>
          <p className="text-2xl md:text-3xl font-bold text-foreground">{stat.value}</p>
          <p className="text-sm text-muted-foreground">{stat.label}</p>
        </div>
      ))}
    </div>
  )
}
