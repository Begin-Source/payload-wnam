"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Mail, CheckCircle } from "lucide-react"

export function NewsletterSection() {
  const [email, setEmail] = useState("")
  const [subscribed, setSubscribed] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email) {
      setSubscribed(true)
      setEmail("")
    }
  }

  return (
    <section className="py-16 md:py-24 bg-primary text-primary-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary-foreground/10 flex items-center justify-center mx-auto mb-6">
            <Mail className="w-7 h-7" />
          </div>
          <h2 className="font-serif text-2xl md:text-3xl font-bold mb-4">
            获取最新评测资讯
          </h2>
          <p className="text-primary-foreground/80 mb-8">
            订阅我们的周报，第一时间获取最新产品评测、购买建议和独家优惠信息。
          </p>
          
          {subscribed ? (
            <div className="flex items-center justify-center gap-2 text-primary-foreground">
              <CheckCircle className="w-5 h-5" />
              <span>感谢订阅！请查收确认邮件。</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="输入您的邮箱地址"
                className="flex-1 px-4 py-3 rounded-lg bg-primary-foreground/10 border border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary-foreground/30"
                required
              />
              <Button 
                type="submit"
                className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 px-6"
              >
                免费订阅
              </Button>
            </form>
          )}
          
          <p className="text-xs text-primary-foreground/60 mt-4">
            我们尊重您的隐私，随时可以取消订阅。
          </p>
        </div>
      </div>
    </section>
  )
}
