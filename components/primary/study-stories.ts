import type {PrimaryGrade} from '@/lib/primary-types';

export interface StudyStory {
  id:string;
  title:string;
  subtitle:string;
  lines:readonly (readonly [english:string,chinese:string])[];
  questions:readonly {prompt:string;options:readonly string[];correct:number;line:number}[];
}

export const stories:Record<PrimaryGrade,readonly StudyStory[]>={
  3:[
    {
      id:'lunch',title:'The Red Lunch Box',subtitle:'午饭盒去了哪里？',
      lines:[
        ['It is lunch time. Lily has a red lunch box.','到午饭时间了。莉莉有一个红色的午饭盒。'],
        ['She looks in her schoolbag. The box is not there.','她在书包里找了找。饭盒不在那里。'],
        ['Her friend Ben points to a chair. The lunch box is under it.','她的朋友本指着一把椅子。饭盒就在椅子下面。'],
        ['Lily says, “Thank you, Ben!” Then they eat lunch together.','莉莉说：“谢谢你，本！”然后他们一起吃午饭。']
      ],
      questions:[
        {prompt:'What colour is the lunch box?',options:['Blue.','Red.','Green.'],correct:1,line:0},
        {prompt:'Where is the box?',options:['Under a chair.','In Lily’s bag.','On a desk.'],correct:0,line:2},
        {prompt:'Who helps Lily?',options:['Her dad.','Her teacher.','Her friend Ben.'],correct:2,line:2}
      ]
    },
    {
      id:'snail',title:'A Little Snail',subtitle:'雨后的小发现',
      lines:[
        ['It stops raining. Dan and May go into the garden.','雨停了。丹和梅走进花园。'],
        ['Dan sees a small snail on a leaf. “Look at its house!” he says.','丹在一片叶子上看到了一只小蜗牛。“看看它的房子！”他说。'],
        ['May takes a photo of the snail. She leaves it on the leaf.','梅给蜗牛拍了张照片。她把蜗牛留在了叶子上。'],
        ['They go inside and show the photo to Mum.','他们进屋把照片拿给妈妈看。']
      ],
      questions:[
        {prompt:'What does Dan see?',options:['A bird.','A frog.','A snail.'],correct:2,line:1},
        {prompt:'What does May do?',options:['She takes a photo.','She picks a flower.','She brings the snail in.'],correct:0,line:2},
        {prompt:'Who sees the photo inside?',options:['Their teacher.','Mum.','Dad.'],correct:1,line:3}
      ]
    }
  ],
  4:[
    {
      id:'library',title:'Two Books for Saturday',subtitle:'去图书馆借书',
      lines:[
        ['On Saturday morning, Alex goes to the library with his sister Mia.','周六早上，亚历克斯和妹妹米娅一起去图书馆。'],
        ['Alex wants a book about space, but the only space book is already out.','亚历克斯想借一本关于太空的书，可唯一的那本已经被借走了。'],
        ['Mia finds a book about the moon on another shelf. Alex decides to try it.','米娅在另一个书架上找到一本介绍月球的书。亚历克斯决定看看这本。'],
        ['Mia borrows a book about sea animals. They read together at home that afternoon.','米娅借了一本关于海洋动物的书。那天下午，两人在家一起读书。']
      ],
      questions:[
        {prompt:'When do they go to the library?',options:['Friday afternoon.','Saturday morning.','Saturday afternoon.'],correct:1,line:0},
        {prompt:'Why can’t Alex borrow the first book he wants?',options:['It is already out.','It is too long.','It is on the floor.'],correct:0,line:1},
        {prompt:'What is Mia’s book about?',options:['The moon.','Space travel.','Sea animals.'],correct:2,line:3}
      ]
    },
    {
      id:'picnic',title:'A Picnic at Home',subtitle:'下雨天的野餐',
      lines:[
        ['Nora and her family pack bread and fruit for a picnic in the park.','诺拉和家人带了面包和水果，准备去公园野餐。'],
        ['Before they leave, dark clouds cover the sky. Soon it starts to rain.','出门前，乌云遮住了天空。很快下起了雨。'],
        ['“Let’s have our picnic here,” Nora says. She puts a blanket on the living room floor.','“我们就在这儿野餐吧，”诺拉说。她在客厅地板上铺了一条毯子。'],
        ['Her brother puts on some music. The family shares the food and tells funny stories.','她的哥哥放起音乐。一家人分享食物，讲起好笑的故事。']
      ],
      questions:[
        {prompt:'Where do they plan to go at first?',options:['To a shop.','To school.','To the park.'],correct:2,line:0},
        {prompt:'What makes them change the plan?',options:['The rain.','The music.','The food.'],correct:0,line:1},
        {prompt:'Where does Nora put the blanket?',options:['On a bed.','On the living room floor.','Outside the house.'],correct:1,line:2}
      ]
    }
  ],
  5:[
    {
      id:'repair',title:'A Wobbly Wheel',subtitle:'科学展示前的小故障',
      lines:[
        ['Chen and Jo build a small model van for their science show. It goes straight in their first test.','陈和乔为科学展示做了一辆小货车模型。第一次测试时，它开得很直。'],
        ['During the second test, the van turns left and stops. Chen thinks it needs a new motor.','第二次测试时，小车向左转，然后停了下来。陈觉得需要换一个电动机。'],
        ['Jo puts the van upside down and checks every wheel. One wheel rubs against the side.','乔把车翻过来检查每个轮子。一个车轮擦到了车身。'],
        ['They move that wheel a little and try again. This time the van reaches the end of the track.','他们把那个车轮挪了一点，再试一次。这回小车到达了轨道终点。']
      ],
      questions:[
        {prompt:'When does the van turn left and stop?',options:['Before the first test.','During the second test.','After they fix the wheel.'],correct:1,line:1},
        {prompt:'What causes the problem?',options:['A wheel touches the side.','The track is too long.','The motor is missing.'],correct:0,line:2},
        {prompt:'How do they solve the problem?',options:['They buy a new van.','They change the track.','They move a wheel.'],correct:2,line:3}
      ]
    },
    {
      id:'garden',title:'Water for the Garden',subtitle:'下雨以后怎样给菜地浇水？',
      lines:[
        ['Four pupils look after the school garden. On hot days, carrying water from the classroom takes several trips.','四名学生负责照看学校的菜地。天热时，从教室提水需要走好几趟。'],
        ['They place a clean bucket under the end of a pipe that carries rainwater from the roof.','他们把一个干净的桶放在管子下面，管子会把屋顶上的雨水引下来。'],
        ['After a rainy night, the bucket is almost full. They use the water on the plants the next morning.','下了一夜雨后，桶几乎满了。第二天早上，他们用这些水浇植物。'],
        ['They put a label on the bucket: “For plants only.” Everyone knows what the water is for.','他们在桶上贴了张标签：“仅供浇植物。”大家都知道这些水是干什么用的了。']
      ],
      questions:[
        {prompt:'Why do the pupils put a bucket by the pipe?',options:['To plant seeds in it.','To keep it cool.','To collect rainwater.'],correct:2,line:1},
        {prompt:'When do they use the collected water?',options:['The next morning.','Before it rains.','On the same night.'],correct:0,line:2},
        {prompt:'What is the collected water used for?',options:['Cooking.','Watering plants.','Washing windows.'],correct:1,line:3}
      ]
    }
  ],
  6:[
    {
      id:'poster',title:'Which Route Is Better?',subtitle:'为步行活动选路线',
      lines:[
        ['The class is planning a short walk to a museum. Mei suggests taking Hill Street because it is five minutes quicker.','全班正在规划一段去博物馆的短途步行。梅建议走山丘街，因为能快五分钟。'],
        ['Sam notices that Hill Street includes a busy crossing with no traffic lights. The river path is longer but has a marked crossing with lights.','萨姆发现山丘街有个繁忙的路口，却没有红绿灯。沿河路线长一些，但有带红绿灯的人行横道。'],
        ['The class walks both routes with a teacher. Their teacher asks them to compare the time, crossings and pavement.','全班和老师实走了两条路线。老师让大家比较用时、路口和人行道。'],
        ['They choose the river path and set off five minutes earlier. They mark the crossing on a map for the next class.','他们选择沿河路线，提前五分钟出发。他们在地图上标出过街地点，供下一个班参考。']
      ],
      questions:[
        {prompt:'Why does Mei suggest Hill Street at first?',options:['It has more shops.','It takes less time.','It is beside the river.'],correct:1,line:0},
        {prompt:'Why do they most likely choose the river path?',options:['Its marked crossing has traffic lights.','It takes five minutes less.','They can buy a map there.'],correct:0,line:1},
        {prompt:'How do they make up for the longer route?',options:['They take a bus.','They leave without the teacher.','They start five minutes earlier.'],correct:2,line:3}
      ]
    },
    {
      id:'radio',title:'Room for One More Voice',subtitle:'校园广播采访',
      lines:[
        ['A school radio team asks pupils about the new playground. During lunch, they talk to five basketball players near the court.','校园广播小组向同学们了解新操场。午饭时，他们在球场边采访了五名打篮球的同学。'],
        ['The team is ready to say everyone likes the playground. Ada reminds them that the pupils they met were all using the same part of it.','小组正准备说大家都喜欢新操场。艾达提醒他们，受访的同学都在使用操场的同一个区域。'],
        ['They ask pupils elsewhere. Some enjoy the open space, while others would like a quieter place to read or talk.','他们又去其他地方采访。一些同学喜欢开阔的空间，另一些同学想要一个更安静的地方读书或聊天。'],
        ['In the final report, the team shares both views and asks listeners what they would change.','在最后的报道中，小组分享了两种看法，并请听众谈谈自己想改动什么。']
      ],
      questions:[
        {prompt:'Who do they interview first?',options:['Five teachers.','Readers near the library.','Five basketball players.'],correct:2,line:0},
        {prompt:'Why does Ada suggest talking to more pupils?',options:['The first pupils use the same area.','The team lost the recordings.','The court will close soon.'],correct:0,line:1},
        {prompt:'What do they include in the report?',options:['Only the players’ opinions.','Both views and a question.','A new playground design.'],correct:1,line:3}
      ]
    }
  ]
};
