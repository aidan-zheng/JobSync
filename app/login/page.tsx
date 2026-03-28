"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import styles from "./login.module.css";
import Grainient from "@/components/Grainient/Grainient";
import { SiGoogle, SiGithub } from "react-icons/si";
import { Briefcase } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  async function signInWithOAuth(provider: "google" | "github") {
    const extraOptions =
      provider === "google"
        ? {
            scopes: "https://www.googleapis.com/auth/gmail.readonly",
            queryParams: { access_type: "offline", prompt: "consent" },
          }
        : {};

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        ...extraOptions,
      },
    });
    if (error) {
      console.error(error);
      return;
    }
    if (data?.url) {
      router.push(data.url);
    }
  }

  return (
    <div className={styles.page}>
      <motion.div
        className={styles.background}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <Grainient
          color1="#FF9FFC"
          color2="#5227FF"
          color3="#B19EEF"
          timeSpeed={0.7}
          colorBalance={0}
          warpStrength={1}
          warpFrequency={5}
          warpSpeed={2}
          warpAmplitude={50}
          blendAngle={0}
          blendSoftness={0.05}
          rotationAmount={500}
          noiseScale={2}
          grainAmount={0.1}
          grainScale={2}
          grainAnimated={false}
          contrast={1.5}
          gamma={1}
          saturation={1}
          centerX={0}
          centerY={0}
          zoom={0.9}
        />
      </motion.div>
      <motion.div
        className={styles.content}
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{
          duration: 1,
          delay: 0.25,
          ease: "easeInOut",
          type: "spring",
        }}
      >
        <div className={styles.brand}>
          <Briefcase className={styles.brandIcon} size={28} aria-hidden />
          <span className={styles.appName}>JobSync</span>
        </div>

        <section className={styles.welcomeSection}>
          <h1 className={styles.welcomeTitle}>Welcome to JobSync!</h1>
          <p className={styles.welcomeSubtitle}>
            Manage your job applications with ease in one place.
          </p>
        </section>

        <div className={styles.socialButtons}>
          <button
            type="button"
            className={`${styles.socialButton} ${styles.socialButtonGithub}`}
            onClick={() => signInWithOAuth("github")}
          >
            <SiGithub size={20} aria-hidden />
            Log in with GitHub
          </button>
          <button
            type="button"
            className={`${styles.socialButton} ${styles.socialButtonGoogle}`}
            onClick={() => signInWithOAuth("google")}
          >
            <SiGoogle size={20} aria-hidden />
            Log in with Google
          </button>
        </div>
      </motion.div>
    </div>
  );
}
