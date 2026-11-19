import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Screen } from '../../components/ui';
import { demoPosts } from '../../demo/data';
import { isUiDemo } from '../../demo/mode';
import { type User } from '../../services/api';
import { useSession } from '../../services/session';
import { colors, styles } from '../../theme';

type Post = {
  id: string;
  text: string;
  time: string;
  author?: string;
  likes: number;
  liked: boolean;
  comments: { id: string; text: string; author?: string }[];
};

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

export default function MomentsScreen() {
  const { session } = useSession();
  return session ? <LocalMoments key={session.user.id} user={session.user} /> : null;
}

function LocalMoments({ user }: { user: User }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState('');
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
  const [draft, setDraft] = useState('');

  function publish() {
    const text = draft.trim();
    if (!text) return;
    const post: Post = {
      id: newId(), text, time: new Date().toLocaleString('zh-CN'),
      likes: 0, liked: false, comments: [],
    };
    setPosts((current) => current && [post, ...current]);
    setDraft('');
  }

  return (
    <Screen title="动态" subtitle="记录生活碎片。动态保存在这台设备。">
      {!!error && <Text accessibilityRole="alert" style={styles.body}>{error}</Text>}
      <View style={styles.card}>
        <Text style={styles.section}>写一条动态</Text>
        <TextInput
          accessibilityLabel="动态内容"
          multiline
          maxLength={280}
          placeholder="今天有什么想记下来的？"
          placeholderTextColor={colors.muted}
          value={draft}
          onChangeText={setDraft}
          style={[styles.input, local.postInput]}
        />
        <View style={styles.row}>
          <Text style={[styles.small, styles.grow]}>{draft.length} / 280</Text>
          <Button label="发布" icon="add" disabled={!posts || !draft.trim()} onPress={publish} />
        </View>
      </View>
      {posts?.map((post) => <PostCard key={post.id} post={post} user={user}
        update={(change) => setPosts((current) => current?.map((item) => item.id === post.id ? change(item) : item) ?? null)} />)}
    </Screen>
  );
}

function PostCard({ post, user, update }: {
  post: Post; user: User; update: (change: (current: Post) => Post) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState('');

  function addComment() {
    const text = reply.trim();
    if (!text) return;
    const comment = { id: newId(), text };
    update((current) => ({ ...current, comments: [...current.comments, comment] }));
    setReply('');
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Avatar name={post.author ?? user.name} color={colors.sage} />
        <View style={styles.grow}>
          <Text style={styles.strong}>{post.author ?? user.name}</Text>
          <Text style={styles.small}>{post.time}</Text>
        </View>
      </View>
      <Text style={styles.body}>{post.text}</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: post.liked }}
          accessibilityLabel={`${post.liked ? '取消点赞' : '点赞'}，${post.likes} 个赞`}
          onPress={() => update((current) => ({
            ...current, liked: !current.liked, likes: current.likes + (current.liked ? -1 : 1),
          }))}
          style={local.action}
        >
          <Ionicons name={post.liked ? 'heart' : 'heart-outline'} size={21} color={post.liked ? colors.danger : colors.green} />
          <Text style={styles.muted}>{post.likes}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`评论，${post.comments.length} 条`}
          onPress={() => setExpanded(!expanded)}
          style={local.action}
        >
          <Ionicons name="chatbubble-outline" size={19} color={colors.green} />
          <Text style={styles.muted}>{post.comments.length}</Text>
        </Pressable>
      </View>
      {expanded && (
        <View style={local.comments}>
          {post.comments.length === 0 && <Text style={styles.muted}>还没有评论。</Text>}
          {post.comments.map((comment) => (
            <Text key={comment.id} style={styles.muted}>
              <Text style={styles.strong}>{comment.author ?? user.name}：</Text>
              {comment.text}
            </Text>
          ))}
          <View style={styles.row}>
            <TextInput
              accessibilityLabel="评论内容"
              placeholder="写条评论"
              placeholderTextColor={colors.muted}
              value={reply}
              onChangeText={setReply}
              maxLength={140}
              style={[styles.input, styles.grow]}
            />
            <Button label="评论" disabled={!reply.trim()} onPress={addComment} />
          </View>
        </View>
      )}
    </View>
  );
}

const local = StyleSheet.create({
  postInput: { minHeight: 84, textAlignVertical: 'top' },
  action: { ...styles.row, minHeight: 44, minWidth: 44, gap: 6, paddingHorizontal: 6 },
  comments: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 12, gap: 8 },
});
