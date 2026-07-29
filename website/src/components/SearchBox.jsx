import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

export default function SearchBox({ size = 'md', initial = '', placeholder = '搜索专家、技能、团队…' }) {
  const [q, setQ] = useState(initial);
  const navigate = useNavigate();

  const submit = (e) => {
    e.preventDefault();
    const query = q.trim();
    navigate(query ? `/marketplace?q=${encodeURIComponent(query)}` : '/marketplace');
  };

  return (
    <form
      className={`searchbox${size === 'lg' ? ' searchbox-lg' : ''}`}
      onSubmit={submit}
      role="search"
    >
      <Search size={size === 'lg' ? 18 : 15} />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label="搜索市场"
      />
      <kbd>/</kbd>
    </form>
  );
}
