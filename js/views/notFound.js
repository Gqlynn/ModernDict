/**
 * 未收录页面：未知 hash 路由兜底。
 */
export default {
  async render(ctx) {
    ctx.setTitle('此页未收录');
    ctx.mount.innerHTML = `<section class="not-found" aria-labelledby="not-found-title">
      <p class="not-found-kicker">翻检无着</p>
      <h1 class="not-found-title" id="not-found-title">此页未收录</h1>
      <p class="not-found-message">你要找的页面不在这部词典里。</p>
      <div class="not-found-actions">
        <a class="btn btn-primary" href="#/">返回首页</a>
        <a class="btn btn-secondary" href="#/browse">翻阅词典正文</a>
        <a class="btn btn-ghost" href="#/search">检索全书</a>
      </div>
    </section>`;
  },
};
