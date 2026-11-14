package com.abdullahschool.myapp;
import java.util.*;
public final class SoundChannelPolicyCheck {
  private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
  public static void main(String[] args) {
    List<SoundChannelPolicy.Candidate> channels = new ArrayList<>();
    for(int index=0;index<7;index++) channels.add(new SoundChannelPolicy.Candidate("old-"+index,index,true));
    check(SoundChannelPolicy.evictionsForNewChannel(channels).isEmpty(),"Seven channels must allow one more without deletion");
    channels.add(new SoundChannelPolicy.Candidate("current",-100,false));
    check(SoundChannelPolicy.evictionsForNewChannel(channels).equals(Arrays.asList("old-0")),"The oldest eligible channel must be selected, never the current one");
    channels.add(new SoundChannelPolicy.Candidate("server-current",-200,false));
    check(SoundChannelPolicy.evictionsForNewChannel(channels).equals(Arrays.asList("old-0","old-1")),"A larger legacy collection must return to the bound without removing the server channel");
    List<SoundChannelPolicy.Candidate> locked=new ArrayList<>();
    for(int index=0;index<8;index++)locked.add(new SoundChannelPolicy.Candidate("customized-"+index,index,false));
    try {SoundChannelPolicy.evictionsForNewChannel(locked);throw new AssertionError("User-customized channels must not be discarded");}catch(IllegalStateException expected){}
    check(locked.size()==8,"A rejected plan must not mutate existing settings");
    channels=new ArrayList<>();channels.add(new SoundChannelPolicy.Candidate("current",0,false));channels.add(new SoundChannelPolicy.Candidate("server-current",0,false));
    for(int index=1;index<=100;index++){
      List<String> remove=SoundChannelPolicy.evictionsForNewChannel(channels);
      channels.removeIf(channel->remove.contains(channel.id));channels.add(new SoundChannelPolicy.Candidate("file-"+index,index,true));
      check(channels.size()<=8,"Repeated imports must remain bounded");
      check(channels.stream().anyMatch(channel->channel.id.equals("current")),"Current channel lost");
      check(channels.stream().anyMatch(channel->channel.id.equals("server-current")),"Server channel lost");
    }
    System.out.println("PASS: five native channel-policy checks, including 100 bounded imports and preservation of user settings.");
  }
}
