'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion'; // 导入 framer-motion 核心组件
import { Loader2, Sparkles, AlertCircle, Mail, Lock, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';

// 🚀 定义动画预设 (基于 framer-motion)
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }, // 错落入场
  },
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: { 
    y: 0, 
    opacity: 1, 
    transition: { type: 'spring', stiffness: 300, damping: 24 } // 弹性动画
  },
};

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // 鉴权引导逻辑 (保持不变)
  useEffect(() => {
    let ignore = false;
    async function bootstrap() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!res.ok) throw new Error('Auth check failed');
        const data = await res.json();
        if (ignore) return;
        
        setAdminExists(Boolean(data.adminExists));
        if (data.adminExists === false) {
          router.replace('/setup/admin');
        } else if (data.authenticated) {
          router.replace('/');
        } else {
          setIsCheckingAuth(false);
        }
      } catch {
        setIsCheckingAuth(false);
      }
    }
    void bootstrap();
    return () => { ignore = true; };
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('auth.loginFailed'));
        return;
      }
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  }

  // 全屏 Loading 状态 (防闪烁)
  if (isCheckingAuth) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-white dark:bg-slate-950">
        <Loader2 className="size-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <main className="flex min-h-[100dvh] w-full overflow-hidden bg-white font-sans dark:bg-slate-950">
      
      {/* 🌟 左侧：品牌展示区 (仅在 lg 及以上屏幕显示) */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-slate-950 p-12 lg:flex">
        {/* 动态网格背景与光晕 */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
        <div className="absolute -left-1/4 top-1/4 h-[500px] w-[500px] rounded-full bg-indigo-600/30 blur-[120px]" />
        <div className="absolute -bottom-1/4 -right-1/4 h-[600px] w-[600px] rounded-full bg-violet-600/20 blur-[130px]" />

        {/* 顶部 Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-lg">
            <Sparkles className="size-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            Lesson AI Workbench
          </span>
        </div>

        {/* 中部愿景文案 (带有入场动画) */}
        <div className="relative z-10 max-w-lg">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="mb-6 text-4xl font-bold leading-tight tracking-tight text-white lg:text-5xl"
          >
            将老师从排版中<br />彻底解放出来。
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="text-lg text-slate-400"
          >
            输入教学灵感，AI 引擎为您一键生成精美、结构化的教案与课件。让教育回归育人本质。
          </motion.p>
        </div>

        {/* 底部版权信息 */}
        <div className="relative z-10 flex items-center gap-4 text-sm text-slate-500">
          <span>© {new Date().getFullYear()} AI EdTech Inc.</span>
        </div>
      </div>

      {/* 🔐 右侧：交互表单区 (带有 Staggered 入场动画) */}
      <div className="relative flex w-full flex-col items-center justify-center p-6 sm:p-12 lg:w-1/2">
        {/* 移动端 Logo */}
        <div className="absolute top-8 left-8 flex items-center gap-2 lg:hidden">
          <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Sparkles className="size-4" />
          </div>
          <span className="font-bold text-slate-900 dark:text-white">Lesson AI</span>
        </div>

        <motion.div 
          className="w-full max-w-[420px]"
          variants={containerVariants} // 绑定动画预设
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants} className="mb-8 text-center lg:text-left">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t('auth.loginTitle')}
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {t('auth.loginDesc')}
            </p>
          </motion.div>

          {/* 社交快捷登录 (提升高级感) */}
          <motion.div variants={itemVariants} className="mb-6 grid grid-cols-2 gap-3">
            <Button variant="outline" type="button" className="h-11 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {/* Google SVG Icon */}
              <svg className="mr-2 size-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/><path d="M1 1h22v22H1z" fill="none"/></svg>
              Google
            </Button>
            <Button variant="outline" type="button" className="h-11 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <svg className="mr-2 size-4 text-[#00a4ef]" fill="currentColor" viewBox="0 0 24 24"><path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z"/></svg>
              Microsoft
            </Button>
          </motion.div>

          <motion.div variants={itemVariants} className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200 dark:border-slate-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400 dark:bg-slate-950">
                或者使用邮箱登录
              </span>
            </div>
          </motion.div>

          <form onSubmit={onSubmit} className="space-y-5">
            <motion.div variants={itemVariants} className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('auth.email')}</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
                <Input
                  type="email"
                  placeholder="name@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="h-12 rounded-xl bg-slate-50 pl-10 border border-slate-200 dark:border-slate-800 transition-all focus-visible:ring-indigo-500 dark:bg-slate-900"
                />
              </div>
            </motion.div>

            <motion.div variants={itemVariants} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('auth.password')}</label>
                <Link href="/auth/forgot" className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400" tabIndex={-1}>
                  忘记密码？
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="h-12 rounded-xl bg-slate-50 pl-10 border border-slate-200 dark:border-slate-800 transition-all focus-visible:ring-indigo-500 dark:bg-slate-900"
                />
              </div>
            </motion.div>

            {/* 记住我 */}
            <motion.div variants={itemVariants} className="flex items-center gap-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={rememberMe}
                onClick={() => setRememberMe(!rememberMe)}
                className={`flex size-5 items-center justify-center rounded border transition-colors ${rememberMe ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'}`}
              >
                {rememberMe && <Check className="size-3.5" />}
              </button>
              <span className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer" onClick={() => setRememberMe(!rememberMe)}>
                保持登录状态
              </span>
            </motion.div>

            {/* 错误提示框动画 (Framer Motion AnimatePresence) */}
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, y: -10 }} 
                  animate={{ opacity: 1, height: 'auto', y: 0 }} 
                  exit={{ opacity: 0, height: 0, y: -10 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600 dark:border-red-900/30 dark:bg-red-500/10 dark:text-red-400">
                    <AlertCircle className="size-4 shrink-0" />
                    <p>{error}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 登录按钮与微交互 */}
            <motion.div variants={itemVariants} className="pt-2">
              <Button 
                type="submit" 
                disabled={loading}
                className="group relative h-12 w-full overflow-hidden rounded-xl bg-indigo-600 text-base font-semibold shadow-xl shadow-indigo-600/20 transition-all hover:bg-indigo-700 hover:shadow-indigo-600/40 dark:text-white"
              >
                {/* 流光 Hover 特效 */}
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                
                {loading ? (
                  <div className="flex items-center justify-center">
                    <Loader2 className="mr-2 size-5 animate-spin" />
                    {t('auth.signingIn')}
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    {t('auth.signIn')}
                    {/* Hover 时箭头位移动画 */}
                    <svg className="size-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </div>
                )}
              </Button>
            </motion.div>
          </form>

          {adminExists ? (
            <motion.div variants={itemVariants} className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {t('auth.noAccount')}{' '}
              <Link href="/auth/register" className="font-semibold text-indigo-600 transition-colors hover:text-indigo-500 hover:underline dark:text-indigo-400">
                {t('auth.register')}
              </Link>
            </motion.div>
          ) : null}
        </motion.div>
      </div>
    </main>
  );
}
