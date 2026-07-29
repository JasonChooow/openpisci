import React, { useEffect } from 'react';
import Nav from '../components/Nav';
import Footer from '../components/Footer';

const modelHubBaseUrl =
  import.meta.env.VITE_MODEL_HUB_URL || 'http://127.0.0.1:3000';
const normalizedModelHubUrl = modelHubBaseUrl.replace(/\/$/, '');

export default function ModelPage() {
  const destination = `${normalizedModelHubUrl}/pricing`;

  useEffect(() => {
    window.location.replace(destination);
  }, [destination]);

  return (
    <>
      <Nav />
      <main className="model-page">
        <section className="model-hero">
          <span className="model-kicker">9X bot 模型服务</span>
          <h1>正在进入模型广场</h1>
          <p>页面将直接打开模型目录、价格清单与控制台，不再加载嵌入式预览。</p>
          <a className="btn btn-primary btn-lg" href={destination}>
            立即进入
          </a>
        </section>
      </main>
      <Footer />
    </>
  );
}
