import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Empty, Icon, IconButton, Notice, Screen, Sheet } from '../../components/ui';
import { demoPosts } from '../../demo/data';
import { isUiDemo } from '../../demo/mode';
import { demoMomentPhoto, demoPortrait } from '../../demo/visuals';
import type { User } from '../../services/api';
import { useSession } from '../../services/session';
import { colors, styles } from '../../theme';

type Post = {
  id: string;
  text: string;
  time: string;
  author?: string;
  username?: string;
  photo?: Parameters<typeof demoMomentPhoto>[0];
  likes: number;
  liked: boolean;
  reaction?: string;
  comments: { id: string; text: string; author?: string }[];
};

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

export default function MomentsScreen() {
  const { session } = useSession();
  return session ? <LocalMoments key={session.user.id} user={session.user} /> : null;
}

function LocalMoments({ user }: { user: User }) {
  const { mine } = useLocalSearchParams<{ mine?: string }>();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState('');
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');
  const storageKey = 'penlia.moments.v1.' + user.id;

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(storageKey).then((value) => {
      if (active) setPosts(value ? JSON.parse(value) as Post[] : isUiDemo ? demoPosts : []);
    }).catch(() => { if (active) setError('暂时无法读取本机动态。'); });
    return () => { active = false; };
  }, [storageKey]);

  useEffect(() => {
    if (!posts) return;
    let active = true;
    void AsyncStorage.setItem(storageKey, JSON.stringify(posts))
      .then(() => { if (active) setError(''); })
      .catch(() => { if (active) setError('暂时无法保存本机动态。'); });
    return () => { active = false; };
  }, [posts, storageKey]);

  function publish() {
    const text = draft.trim();
    if (!text || !posts) return;
    const post: Post = {
      id: newId(), text, time: new Date().toLocaleString('zh-CN'),
      likes: 0, liked: false, comments: [],
    };
    setPosts((current) => current && [post, ...current]);
    setDraft('');
    setWriting(false);
    Keyboard.dismiss();
  }

  const visible = mine === '1' ? posts?.filter((post) => !post.author) : posts;
  return <Screen title="动态" solid inset={false} actions={
    <IconButton label="发布动态" icon="create-outline" tinted onPress={() => setWriting(true)} />
  }>
    <View style={local.feedBar}>
      <View style={local.feedTabs}>
        {[['全部动态', '0'], ['我的动态', '1']].map(([label, value]) => {
          const selected = (mine === '1' ? '1' : '0') === value;
          return <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => router.setParams({ mine: value })}
            style={[local.tab, selected && local.selected]}>
            <Text style={selected ? local.selectedText : styles.muted}>{label}</Text>
          </Pressable>;
        })}
      </View>
      <Text style={styles.small}>仅此设备</Text>
    </View>
    {!!error && <View style={local.inset}><Notice>{error}</Notice></View>}
    {!posts && !error && <Empty busy>正在读取本机动态…</Empty>}
    {visible?.length === 0 && <Empty icon="create-outline">还没有动态，写下今天的一件小事。</Empty>}
    {visible?.map((post) => <PostCard key={post.id} post={post} user={user}
      update={(change) => setPosts((current) => current?.map((item) => item.id === post.id ? change(item) : item) ?? null)} />)}
    {writing && <Sheet title="发布动态" onClose={() => setWriting(false)}>
      <Text style={styles.muted}>这条动态只保存在本机。</Text>
      <TextInput accessibilityLabel="动态内容" multiline maxLength={280} placeholder="今天想记下什么？"
        placeholderTextColor={colors.quiet} value={draft} onChangeText={setDraft} style={[styles.input, local.postInput]} />
      <View style={styles.row}>
        <Text style={[styles.small, styles.grow]}>{draft.length} / 280</Text>
        <Button label="发布" disabled={!posts || !draft.trim()} onPress={publish} />
      </View>
    </Sheet>}
  </Screen>;
}

function PostCard({ post, user, update }: {
  post: Post; user: User; update: (change: (current: Post) => Post) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [reply, setReply] = useState('');

  function addComment() {
    const text = reply.trim();
    if (!text) return;
    const comment = { id: newId(), text };
    update((current) => ({ ...current, comments: [...current.comments, comment] }));
    setReply('');
  }

  const photo = post.photo && demoMomentPhoto(post.photo);

  return <View style={local.post}>
    <View style={styles.row}>
      <Avatar size={39} name={post.author ?? user.name} source={demoPortrait(post.username ?? user.username)} />
      <View style={styles.grow}>
        <Text style={styles.strong}>{post.author ?? user.name}</Text>
        <Text style={styles.small}>{post.time}</Text>
      </View>
    </View>
    <Text style={styles.body}>{post.text}</Text>
    {photo && <Image accessible accessibilityLabel="演示动态配图" source={photo} style={local.photo} />}
    <View style={local.actions}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: post.liked }}
        accessibilityLabel={`${post.liked ? '取消点赞' : '点赞'}，${post.likes} 个赞`}
        onPress={() => update((current) => ({ ...current, liked: !current.liked, likes: current.likes + (current.liked ? -1 : 1) }))}
        style={local.action}>
        <Icon name={post.liked ? 'heart' : 'heart-outline'} size={20} color={post.liked ? colors.accent : colors.ink} />
        <Text style={styles.muted}>{post.likes}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
        accessibilityLabel={`评论，${post.comments.length} 条`} onPress={() => setExpanded(!expanded)} style={local.action}>
        <Icon name="chatbubble-outline" size={18} />
        <Text style={styles.muted}>{post.comments.length}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="表情回应" onPress={() => setReacting(!reacting)} style={local.action}>
        {post.reaction ? <Text style={styles.body}>{post.reaction}</Text> : <Icon name="happy-outline" size={20} />}
      </Pressable>
    </View>
    {reacting && <View style={local.actions}>
      {['❤️', '🙌', '😂', '✨'].map((emoji) => <Button key={emoji} label={emoji} variant="soft"
        onPress={() => { update((current) => ({ ...current, reaction: current.reaction === emoji ? undefined : emoji })); setReacting(false); }} />)}
    </View>}
    {post.comments.length > 0 && !expanded && <Pressable accessibilityRole="button" accessibilityLabel="查看评论"
      style={local.comment} onPress={() => setExpanded(true)}>
      <Text style={styles.muted} numberOfLines={1}><Text style={styles.strong}>{post.comments[0]?.author ?? user.name} </Text>{post.comments[0]?.text}</Text>
    </Pressable>}
    {expanded && <View style={local.replies}>
      {post.comments.map((comment) => <Text key={comment.id} style={styles.muted}>
        <Text style={styles.strong}>{comment.author ?? user.name} </Text>{comment.text}
      </Text>)}
      <View style={styles.row}>
        <TextInput accessibilityLabel="评论内容" value={reply} onChangeText={setReply} maxLength={140}
          placeholder="写条评论" placeholderTextColor={colors.quiet} style={[styles.input, styles.grow]} />
        <Button label="评论" disabled={!reply.trim()} onPress={addComment} />
      </View>
    </View>}
  </View>;
}

const local = StyleSheet.create({
  inset: { paddingHorizontal: 16 },
  feedBar: { ...styles.row, ...styles.divider, justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 53 },
  feedTabs: { flexDirection: 'row', gap: 13 },
  tab: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  selected: { borderColor: '#E46986' },
  selectedText: { ...styles.strong, color: colors.accent },
  post: { paddingHorizontal: 16, paddingTop: 15, paddingBottom: 13, gap: 9, borderBottomWidth: 5, borderBottomColor: colors.backdrop },
  photo: { width: '100%', aspectRatio: 1.81, resizeMode: 'cover', borderRadius: 11, backgroundColor: colors.lavender },
  postInput: { minHeight: 112, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  action: { ...styles.row, gap: 6, minHeight: 44, minWidth: 44 },
  comment: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.backdrop },
  replies: { gap: 9, padding: 10, borderRadius: 12, backgroundColor: colors.backdrop },
});
