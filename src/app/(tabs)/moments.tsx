import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Screen } from '../../components/ui';
import { formatTime, newId, peopleById, type Post, self } from '../../demo-data';
import { useDemo } from '../../demo-store';
import { colors, styles } from '../../theme';

const topicColor = { 散步: colors.sage, 音乐: colors.peach, 日常: '#EBE9F4' };

export default function MomentsScreen() {
  const { demo, setDemo } = useDemo();
  const [draft, setDraft] = useState('');

  function publish() {
    const text = draft.trim();
    if (!text) return;
    const post: Post = {
      id: newId(), authorId: self.id, text, time: formatTime(new Date()), topic: '日常',
      likes: 0, liked: false, comments: [],
    };
    setDemo((current) => ({ ...current, posts: [post, ...current.posts] }));
    setDraft('');
  }

  return (
    <Screen title="动态" subtitle="记录生活碎片。演示动态只保存在这台设备。">
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
          <Button label="发布" icon="add" disabled={!draft.trim()} onPress={publish} />
        </View>
      </View>
      {demo.posts.map((post) => <PostCard key={post.id} post={post} />)}
    </Screen>
  );
}

function PostCard({ post }: { post: Post }) {
  const { demo, setDemo } = useDemo();
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState('');
  const author = post.authorId === self.id ? { ...self, ...demo.profile } : peopleById.get(post.authorId)!;

  function updatePost(update: (current: Post) => Post) {
    setDemo((current) => ({
      ...current,
      posts: current.posts.map((item) => item.id === post.id ? update(item) : item),
    }));
  }

  function addComment() {
    const text = reply.trim();
    if (!text) return;
    const comment = { id: newId(), authorId: self.id, text };
    updatePost((current) => ({ ...current, comments: [...current.comments, comment] }));
    setReply('');
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Avatar name={author.name} color={author.color} />
        <View style={styles.grow}>
          <Text style={styles.strong}>{author.name}</Text>
          <Text style={styles.small}>{post.time}</Text>
        </View>
        <Text style={[local.topic, { backgroundColor: topicColor[post.topic] }]}>{post.topic}</Text>
      </View>
      <Text style={styles.body}>{post.text}</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: post.liked }}
          accessibilityLabel={`${post.liked ? '取消点赞' : '点赞'}，${post.likes} 个赞`}
          onPress={() => updatePost((current) => ({
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
              <Text style={styles.strong}>{comment.authorId === self.id ? demo.profile.name : peopleById.get(comment.authorId)?.name}：</Text>
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
  topic: { color: colors.deep, borderRadius: 12, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, fontSize: 12, fontWeight: '700' },
  action: { ...styles.row, minHeight: 44, minWidth: 44, gap: 6, paddingHorizontal: 6 },
  comments: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 12, gap: 8 },
});
