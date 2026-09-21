---
layout: page
title: Projects
list_title: false
---

<section class="hero">
  <p class="hero-eyebrow">Music Intelligence Lab</p>
  <h1 class="hero-title">Instruments, models, and musical traditions.</h1>
  <p class="hero-lede">
    A research group at the American University of Beirut working at the intersection of music, technology, and intelligence. We design new instruments, build machine learning models for music understanding and generation, and treat Arabic and Mediterranean musical traditions as living, computable material.
  </p>
  <p class="hero-meta">
    Led by <a href="https://www.josephbakarji.com" target="_blank">Joseph Bakarji</a>. Housed jointly at the
    <a href="https://www.aub.edu.lb/msfea/Pages/default.aspx" target="_blank">Maroun Semaan Faculty of Engineering and Architecture</a>
    and the
    <a href="https://scds.aub.edu.lb/" target="_blank">School of Computing and Data Sciences</a>.
  </p>
</section>

<section class="what-we-do">
  <h2 class="section-title"><span class="section-tag">// what we do</span></h2>
  <p>We approach music as three interconnected forms of intelligence and try to keep them in conversation rather than choose between them.</p>
  <ul class="triad">
    <li><strong>Physical intelligence.</strong> The embodied side of music, from the muscle memory a musician builds over years to the coordination that turns a moving body into a rhythm section.</li>
    <li><strong>Mathematical intelligence.</strong> The structure inside music: tunings, modes, harmonic relations, rhythms as patterns, and the geometry of how they connect.</li>
    <li><strong>Computational intelligence.</strong> Signal analysis, representation learning, and generative models that let us describe and extend musical practice.</li>
  </ul>
  <p>Our goal is to build tools and instruments that empower musicians and dancers, in ways that stay personal, human, and rooted in specific cultural contexts.</p>
</section>

<section class="projects">
  <h2 class="section-title"><span class="section-tag">// projects</span></h2>

  <article class="project-card project-card--featured">
    <div class="project-body">
      <p class="project-badge">Featured, 2026 to 2028</p>
      <h3>Music in Motion</h3>
      <p><strong>Music in Motion</strong> is a two-year <em>Ecologies of Culture, Creative Labs</em> project co-led by Joseph Bakarji, Elsa Maalouf (co-PI), and Olivier Chiniara (co-grantee). Through wearable sensors, video pose estimation, and machine learning models that discover natural correspondences between motion and sound, we are turning full-body movement, including dance, into a musical instrument.</p>
      <p>The project builds on our ongoing Rope Flow Music work and generalises it toward the wider space of free human movement. Public performances, an open-source release, and a set of prototypes are planned across 2026 to 2028.</p>
      <p class="project-fine-print">The Ecologies of Culture programme is co-funded by the European Union and led by the Arab Fund for Arts and Culture (AFAC), in partnership with Oxfam, Echos Electrik, and Megaphone.</p>
      <p class="project-links">
        <a href="https://www.josephbakarji.com/articles/?slug=music-in-motion" target="_blank">Read the announcement</a>
      </p>
    </div>
  </article>

  <article class="project-card">
    <div class="project-body">
      <h3>Rope Flow Music</h3>
      <p>A weighted "flow" rope is instrumented with an inertial sensor at the handle and streams motion over Bluetooth into a live pipeline. Movement is classified into a small learned vocabulary of cycles, and each cycle is mapped to musical output through a DAW.</p>
      <p>The rope started in 2024 as our first movement-to-sound experiment and is the technical seed of Music in Motion. It has been presented at NeurIPS Creative AI 2026 (Agency track).</p>
      <p class="project-links"><a href="https://www.josephbakarji.com/projects/#proj-musical-flow-rope" target="_blank">Project page</a></p>
    </div>
  </article>

  <article class="project-card">
    <div class="project-media">
      <img src="{{ '/assets/images/gluvn.jpg' | relative_url }}" alt="Gluvn glove instrument">
    </div>
    <div class="project-body">
      <h3>Gluvn: a musical glove</h3>
      <p>Gluvn is a wearable five-finger sensor glove that maps hand posture and gesture to expressive musical control. Flex sensors on the fingers, pressure at the fingertips, and inertial sensing at the wrist are combined into continuous MIDI and audio control signals.</p>
      <p>Where the rope constrains the body into a small learnable vocabulary, the glove sits at the opposite pole: an unbounded gesture space that has to be shaped into playability through careful mapping design.</p>
      <p class="project-links"><a href="https://www.josephbakarji.com/articles/?slug=gluvn" target="_blank">Gallery + writeup</a></p>
    </div>
  </article>

  <article class="project-card">
    <div class="project-media">
      <img src="{{ '/assets/images/maqamarchive.png' | relative_url }}" alt="DiArMaqAr">
    </div>
    <div class="project-body">
      <h3>Digital Arabic Maqam Archive (DiArMaqAr)</h3>
      <p>DiArMaqAr is an open-source, open-access web platform for exploring Arabic maqām theory and practice. It is the first framework to unify tanāghīm (tuning systems), ajnās (tetrachords), and maqāmāt (melodic modes) in a single interactive environment, drawing on both historical treatises and living performance practice.</p>
      <p>The archive is developed by Khyam Allami with the lab and integrates network-analysis views that expose connections and family structures across the maqām world.</p>
      <p class="project-links">
        <a href="https://diarmaqar.netlify.app/" target="_blank">Open the archive</a>
      </p>
    </div>
  </article>

  <article class="project-card">
    <div class="project-body">
      <h3>Maqam Identification (MaqamNet, ISMIR)</h3>
      <p>MaqamNet is a musicologically interpretable deep-learning framework for Arabic maqām identification. The work was presented at ISMIR 2026 and builds a shared benchmark and analysis pipeline for maqām recognition across recordings from multiple traditions.</p>
      <p class="project-links"><a href="https://github.com/josephbakarji/maqamnet" target="_blank">Code and pitch data</a></p>
    </div>
  </article>

  <article class="project-card">
    <div class="project-media">
      <img src="{{ '/assets/images/aiforarabic.jpg' | relative_url }}" alt="AI for Arabic Music">
    </div>
    <div class="project-body">
      <h3>AI for Arabic Music</h3>
      <p>A broader research strand on generative AI for music that treats Arabic musical traditions as a first-class case rather than an edge case. We investigate how text-to-audio and symbolic models can be adapted to microtonal tuning, maqām-based melody, and rhythmic cycles specific to the region. The goal is to build models that respect the internal logic of a tradition while opening new avenues for improvisation and composition.</p>
    </div>
  </article>
</section>

<section class="partners">
  <h2 class="section-title"><span class="section-tag">// partners and funders</span></h2>
  <ul class="partner-list">
    <li><strong><a href="https://cams.aub.edu.lb" target="_blank">Center for Advanced Mathematical Sciences (CAMS), AUB</a></strong>. Institutional host and long-standing partner on the Music, Mathematics, and Machines initiative.</li>
    <li><strong>AUB Artificial Intelligence, Data Science, and Computing Hub</strong>. Cross-faculty support and computing resources.</li>
    <li><strong>Arab Fund for Arts and Culture (AFAC)</strong>. Funder of Music in Motion, co-funded by the European Union under the Ecologies of Culture (EoC) Creative Labs programme, in partnership with Oxfam, Echos Electrik, and Megaphone.</li>
    <li><strong>AUB Science meets Arts internal stimulus fund</strong>. Supporting composition and performance work with Joelle Khoury.</li>
    <li><strong>AUB University Research Board (URB)</strong>. Internal grant support across our research lines.</li>
  </ul>
</section>

<section class="contact">
  <h2 class="section-title"><span class="section-tag">// contact</span></h2>
  <p>For prospective students, collaborations, or press: <a href="mailto:jb50@aub.edu.lb">jb50@aub.edu.lb</a>. See the <a href="{{ '/people/' | relative_url }}">people page</a> for the full team.</p>
</section>

<div class="attribution">
  <div class="attribution-logos">
    <span class="attribution-eu">
      <img src="{{ '/assets/images/logos/eu-flag.svg' | relative_url }}" alt="Flag of Europe" class="attribution-flag">
      <span class="attribution-eu-text">Co-funded by<br>the European Union</span>
    </span>
    <img src="{{ '/assets/images/logos/afac.png' | relative_url }}" alt="Arab Fund for Arts and Culture" class="attribution-afac">
  </div>

  <p class="attribution-statement"><em>The Music in Motion project is implemented with the support of the Arab Fund for Arts and Culture – AFAC, in partnership with Oxfam, Echos Electrik, and Megaphone and co-funded by the European Union.</em></p>

  <p class="attribution-disclaimer"><em>This document has been produced with the financial assistance of the European Union. The contents of this document are the sole responsibility of Music Intelligence Lab, American University of Beirut &amp; Olivier Chiniara, and can under no circumstances be regarded as reflecting the position of the European Union.</em></p>
</div>
